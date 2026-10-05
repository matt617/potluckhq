import { GetObjectCommand, PutObjectCommand, S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from './env.js';
import { newId } from './ids.js';

export const s3 = new S3Client({});

export const ALLOWED_UPLOAD_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'video/mp4', 'video/quicktime', 'video/webm'];

export function uploadKey(userId: string, contentType: string): string {
  const ext = contentType.split('/')[1]?.replace('quicktime', 'mov').replace('jpeg', 'jpg') ?? 'bin';
  return `uploads/${userId}/${Date.now()}-${newId(8)}.${ext}`;
}

export async function presignUpload(key: string, contentType: string): Promise<string> {
  return getSignedUrl(s3, new PutObjectCommand({ Bucket: env.mediaBucket, Key: key, ContentType: contentType }), { expiresIn: 600 });
}

export async function putObject(key: string, body: Uint8Array, contentType: string, cacheControl?: string): Promise<void> {
  await s3.send(new PutObjectCommand({ Bucket: env.mediaBucket, Key: key, Body: body, ContentType: contentType, CacheControl: cacheControl }));
}

export async function getObjectBytes(key: string): Promise<{ bytes: Uint8Array; contentType: string }> {
  const res = await s3.send(new GetObjectCommand({ Bucket: env.mediaBucket, Key: key }));
  const bytes = await res.Body!.transformToByteArray();
  return { bytes, contentType: res.ContentType ?? 'application/octet-stream' };
}

/** Short-lived GET URL for a private object, e.g. technique video playback. */
export async function presignGet(key: string, expiresIn = 3600): Promise<string> {
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: env.mediaBucket, Key: key }), { expiresIn });
}

export async function deleteObject(key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: env.mediaBucket, Key: key })).catch(() => undefined);
}

/** Copy a remote thumbnail into the public media prefix. Failures are non-fatal. */
export async function storeThumbnail(remoteUrl: string | undefined, name: string): Promise<string | undefined> {
  if (!remoteUrl) return undefined;
  try {
    const res = await fetch(remoteUrl, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return undefined;
    const type = res.headers.get('content-type') ?? 'image/jpeg';
    if (!type.startsWith('image/')) return undefined;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length > 5 * 1024 * 1024) return undefined;
    const key = `media/thumbs/${name}.${type.includes('png') ? 'png' : type.includes('webp') ? 'webp' : 'jpg'}`;
    await putObject(key, bytes, type, 'public, max-age=31536000, immutable');
    return key;
  } catch {
    return undefined;
  }
}
