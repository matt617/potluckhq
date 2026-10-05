import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';

export class HttpError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

export const badRequest = (msg: string) => new HttpError(400, msg, 'bad_request');
export const forbidden = (msg = 'You do not have access to this') => new HttpError(403, msg, 'forbidden');
export const notFound = (msg = 'Not found') => new HttpError(404, msg, 'not_found');
export const tooMany = (msg: string) => new HttpError(429, msg, 'rate_limited');
export const paymentRequired = (msg: string, code: 'ai_tier' | 'ai_allowance' | 'import_quota' | 'tier_limit') => new HttpError(402, msg, code);

export interface Ctx {
  method: string;
  path: string;
  params: Record<string, string>;
  query: Record<string, string | undefined>;
  headers: Record<string, string | undefined>;
  rawBody: string;
  body: unknown;
  user?: { id: string; email: string; name: string };
  event: APIGatewayProxyEventV2;
}

export type RouteHandler = (ctx: Ctx) => Promise<unknown>;

interface Route {
  method: string;
  parts: string[];
  handler: RouteHandler;
}

export class Router {
  private routes: Route[] = [];

  on(method: string, pattern: string, handler: RouteHandler): this {
    this.routes.push({ method, parts: pattern.split('/').filter(Boolean), handler });
    return this;
  }

  match(method: string, path: string): { handler: RouteHandler; params: Record<string, string> } | null {
    const segs = path.split('/').filter(Boolean);
    for (const r of this.routes) {
      if (r.method !== method || r.parts.length !== segs.length) continue;
      const params: Record<string, string> = {};
      let ok = true;
      for (let i = 0; i < segs.length; i++) {
        const p = r.parts[i]!;
        const s = segs[i]!;
        if (p.startsWith(':')) params[p.slice(1)] = decodeURIComponent(s);
        else if (p !== s) { ok = false; break; }
      }
      if (ok) return { handler: r.handler, params };
    }
    return null;
  }
}

export function json(status: number, body: unknown, headers: Record<string, string> = {}): APIGatewayProxyResultV2 {
  return {
    statusCode: status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers },
    body: JSON.stringify(body),
  };
}

export function rawBodyOf(event: APIGatewayProxyEventV2): string {
  if (!event.body) return '';
  return event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
}

export function lowerHeaders(h: Record<string, string | undefined> | undefined): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(h ?? {})) out[k.toLowerCase()] = v;
  return out;
}

export function buildCtx(event: APIGatewayProxyEventV2): Ctx {
  const rawBody = rawBodyOf(event);
  const headers = lowerHeaders(event.headers);
  let body: unknown = undefined;
  if (rawBody && (headers['content-type'] ?? '').includes('json')) {
    try {
      body = JSON.parse(rawBody);
    } catch {
      throw badRequest('Body is not valid JSON');
    }
  }
  return {
    method: event.requestContext.http.method.toUpperCase(),
    path: event.rawPath,
    params: {},
    query: event.queryStringParameters ?? {},
    headers,
    rawBody,
    body,
    event,
  };
}

export async function dispatch(router: Router, ctx: Ctx): Promise<APIGatewayProxyResultV2> {
  try {
    const m = router.match(ctx.method, ctx.path);
    if (!m) throw notFound(`No route for ${ctx.method} ${ctx.path}`);
    ctx.params = m.params;
    const result = await m.handler(ctx);
    if (result && typeof result === 'object' && 'statusCode' in (result as object)) return result as APIGatewayProxyResultV2;
    return json(200, result ?? { ok: true });
  } catch (err) {
    if (err instanceof HttpError) return json(err.status, { error: err.message, code: err.code });
    console.error('Unhandled error', err);
    return json(500, { error: 'Something went wrong', code: 'internal' });
  }
}

/** Minimal runtime validation helpers; keeps bundles small compared to a schema library. */
export function obj(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw badRequest('Expected a JSON object body');
  return body as Record<string, unknown>;
}

export function str(v: unknown, field: string, opts: { max?: number; optional?: boolean } = {}): string | undefined {
  if (v === undefined || v === null || v === '') {
    if (opts.optional) return undefined;
    throw badRequest(`${field} is required`);
  }
  if (typeof v !== 'string') throw badRequest(`${field} must be a string`);
  const s = v.trim();
  if (opts.max && s.length > opts.max) throw badRequest(`${field} must be at most ${opts.max} characters`);
  return s;
}

export function strArray(v: unknown, field: string, maxItems = 100, maxLen = 200): string[] | undefined {
  if (v === undefined) return undefined;
  if (!Array.isArray(v) || v.some((x) => typeof x !== 'string')) throw badRequest(`${field} must be an array of strings`);
  if (v.length > maxItems) throw badRequest(`${field} has too many items`);
  return (v as string[]).map((s) => s.trim().slice(0, maxLen)).filter(Boolean);
}

export function num(v: unknown, field: string, opts: { min?: number; max?: number; optional?: boolean } = {}): number | undefined {
  if (v === undefined || v === null) {
    if (opts.optional) return undefined;
    throw badRequest(`${field} is required`);
  }
  if (typeof v !== 'number' || !Number.isFinite(v)) throw badRequest(`${field} must be a number`);
  if (opts.min !== undefined && v < opts.min) throw badRequest(`${field} must be ≥ ${opts.min}`);
  if (opts.max !== undefined && v > opts.max) throw badRequest(`${field} must be ≤ ${opts.max}`);
  return v;
}
