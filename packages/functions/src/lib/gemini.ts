import { readFile, stat } from 'node:fs/promises';
import { assertAllowedModel, type TokenUsage } from '@potluck/core';
import { secrets } from './secrets.js';

const BASE = 'https://generativelanguage.googleapis.com';

/** Thrown for failures worth retrying through SQS (rate limits, 5xx). */
export class RetryableError extends Error {}
/** Thrown for failures the user should hear about instead of a retry. */
export class UserFacingError extends Error {}

export type Part =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } }
  | { fileData: { mimeType?: string; fileUri: string } };

export interface GenerateOptions {
  model: string;
  system?: string;
  parts: Part[];
  schema?: Record<string, unknown>;
  maxOutputTokens?: number;
  temperature?: number;
  /** Low resolution cuts video tokens roughly 3x; plenty for reading a recipe. */
  lowMediaResolution?: boolean;
}

export interface GenerateResult<T> {
  data: T;
  usage: TokenUsage;
  model: string;
}

async function apiKey(): Promise<string> {
  const key = (await secrets())['gemini-api-key'];
  if (!key) throw new UserFacingError('Recipe extraction is not configured yet (missing Gemini API key).');
  return key;
}

function classify(status: number, body: string): Error {
  if (status === 429 || status >= 500) return new RetryableError(`Gemini ${status}: ${body.slice(0, 300)}`);
  return new Error(`Gemini ${status}: ${body.slice(0, 500)}`);
}

export async function generateJson<T>(opts: GenerateOptions): Promise<GenerateResult<T>> {
  assertAllowedModel(opts.model);
  const key = await apiKey();
  const body = {
    ...(opts.system ? { systemInstruction: { parts: [{ text: opts.system }] } } : {}),
    contents: [{ role: 'user', parts: opts.parts }],
    generationConfig: {
      responseMimeType: 'application/json',
      ...(opts.schema ? { responseSchema: opts.schema } : {}),
      temperature: opts.temperature ?? 0.2,
      maxOutputTokens: opts.maxOutputTokens ?? 4096,
      ...(opts.lowMediaResolution ? { mediaResolution: 'MEDIA_RESOLUTION_LOW' } : {}),
    },
  };
  const res = await fetch(`${BASE}/v1beta/models/${encodeURIComponent(opts.model)}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(170_000),
  });
  const text = await res.text();
  if (!res.ok) throw classify(res.status, text);
  const payload = JSON.parse(text) as {
    candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
    promptFeedback?: { blockReason?: string };
  };
  const usage: TokenUsage = {
    promptTokens: payload.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: (payload.usageMetadata?.candidatesTokenCount ?? 0) + (payload.usageMetadata?.thoughtsTokenCount ?? 0),
  };
  if (payload.promptFeedback?.blockReason) {
    throw Object.assign(new UserFacingError(`The content was blocked by the AI safety filter (${payload.promptFeedback.blockReason}).`), { usage });
  }
  const out = payload.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  try {
    return { data: JSON.parse(out) as T, usage, model: opts.model };
  } catch {
    const finish = payload.candidates?.[0]?.finishReason;
    throw Object.assign(new Error(`Gemini returned unparseable JSON (finish: ${finish})`), { usage });
  }
}

/** Largest file sent inline; base64 inflates by 4/3 and the request cap is 20 MB. */
export const INLINE_LIMIT_BYTES = 14 * 1024 * 1024;

export async function videoPartFromFile(path: string, mimeType: string): Promise<{ part: Part; cleanup: () => Promise<void> }> {
  const { size } = await stat(path);
  if (size <= INLINE_LIMIT_BYTES) {
    const data = (await readFile(path)).toString('base64');
    return { part: { inlineData: { mimeType, data } }, cleanup: async () => undefined };
  }
  const file = await uploadFile(await readFile(path), mimeType);
  return {
    part: { fileData: { mimeType, fileUri: file.uri } },
    cleanup: async () => {
      await deleteFile(file.name).catch(() => undefined);
    },
  };
}

/** Upload through the Gemini Files API (resumable protocol) and wait until it is ACTIVE. */
export async function uploadFile(bytes: Buffer, mimeType: string): Promise<{ name: string; uri: string }> {
  const key = await apiKey();
  const start = await fetch(`${BASE}/upload/v1beta/files`, {
    method: 'POST',
    headers: {
      'x-goog-api-key': key,
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(bytes.length),
      'X-Goog-Upload-Header-Content-Type': mimeType,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ file: { display_name: `potluck-${Date.now()}` } }),
  });
  if (!start.ok) throw classify(start.status, await start.text());
  const uploadUrl = start.headers.get('x-goog-upload-url');
  if (!uploadUrl) throw new Error('Gemini did not return an upload URL');
  const up = await fetch(uploadUrl, {
    method: 'POST',
    headers: { 'Content-Length': String(bytes.length), 'X-Goog-Upload-Offset': '0', 'X-Goog-Upload-Command': 'upload, finalize' },
    body: new Uint8Array(bytes),
  });
  if (!up.ok) throw classify(up.status, await up.text());
  let file = ((await up.json()) as { file: { name: string; uri: string; state: string } }).file;
  const deadline = Date.now() + 120_000;
  while (file.state === 'PROCESSING') {
    if (Date.now() > deadline) throw new RetryableError('Gemini file processing timed out');
    await new Promise((r) => setTimeout(r, 2000));
    const res = await fetch(`${BASE}/v1beta/${file.name}`, { headers: { 'x-goog-api-key': key } });
    if (!res.ok) throw classify(res.status, await res.text());
    file = (await res.json()) as typeof file;
  }
  if (file.state !== 'ACTIVE') throw new UserFacingError('The video could not be processed by the AI.');
  return { name: file.name, uri: file.uri };
}

export async function deleteFile(name: string): Promise<void> {
  const key = await apiKey();
  await fetch(`${BASE}/v1beta/${name}`, { method: 'DELETE', headers: { 'x-goog-api-key': key } });
}
