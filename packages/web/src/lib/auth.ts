/**
 * Cognito managed login with OAuth authorization code + PKCE.
 * The ID token is sent to the API as the bearer token; the backend reads sub, email and name from it.
 */
import { loadRuntimeConfig } from './config';
import { readStore, writeStore } from './storage';

const TOKENS_KEY = 'potluck.tokens';
const PKCE_KEY = 'potluck.pkce';
const SCOPES = 'openid email profile';

interface Tokens {
  idToken: string;
  refreshToken?: string;
  /** Epoch ms when the ID token expires. */
  expiresAt: number;
}

interface PkceState {
  verifier: string;
  state: string;
  returnTo: string;
}

export interface IdClaims {
  sub: string;
  email?: string;
  name?: string;
  exp: number;
}

const redirectUri = () => `${window.location.origin}/auth/callback`;

function base64Url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomString(len = 48): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

async function challengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

export function decodeJwt(token: string): IdClaims | null {
  try {
    const payload = token.split('.')[1] ?? '';
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payload.length / 4) * 4, '='));
    return JSON.parse(decodeURIComponent(escape(json))) as IdClaims;
  } catch {
    return null;
  }
}

function readTokens(): Tokens | null {
  const raw = readStore(TOKENS_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Tokens;
  } catch {
    return null;
  }
}

function saveTokens(t: Tokens | null) {
  writeStore(TOKENS_KEY, t ? JSON.stringify(t) : null);
}

export function isSignedIn(): boolean {
  const t = readTokens();
  return !!t && (t.expiresAt > Date.now() || !!t.refreshToken);
}

export function currentClaims(): IdClaims | null {
  const t = readTokens();
  return t ? decodeJwt(t.idToken) : null;
}

export async function login(returnTo = window.location.pathname + window.location.search): Promise<never> {
  const cfg = await loadRuntimeConfig();
  const pkce: PkceState = { verifier: randomString(64), state: randomString(16), returnTo };
  writeStore(PKCE_KEY, JSON.stringify(pkce), 'session');
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: cfg.clientId,
    redirect_uri: redirectUri(),
    scope: SCOPES,
    state: pkce.state,
    code_challenge_method: 'S256',
    code_challenge: await challengeFor(pkce.verifier),
  });
  window.location.assign(`${cfg.cognitoDomain}/oauth2/authorize?${params}`);
  return new Promise<never>(() => {});
}

async function tokenRequest(body: Record<string, string>): Promise<Tokens> {
  const cfg = await loadRuntimeConfig();
  const res = await fetch(`${cfg.cognitoDomain}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: cfg.clientId, ...body }),
  });
  if (!res.ok) throw new Error(`Token request failed (${res.status})`);
  const json = (await res.json()) as { id_token: string; refresh_token?: string; expires_in: number };
  const claims = decodeJwt(json.id_token);
  return {
    idToken: json.id_token,
    refreshToken: json.refresh_token,
    expiresAt: claims?.exp ? claims.exp * 1000 : Date.now() + json.expires_in * 1000,
  };
}

/** Completes the redirect from Cognito. Returns the path to continue to. */
export async function handleCallback(search: string): Promise<string> {
  const params = new URLSearchParams(search);
  const error = params.get('error_description') || params.get('error');
  if (error) throw new Error(error);
  const code = params.get('code');
  const raw = readStore(PKCE_KEY, 'session');
  const pkce = raw ? (JSON.parse(raw) as PkceState) : null;
  if (!code || !pkce || pkce.state !== params.get('state')) throw new Error('Sign-in link expired. Please try again.');
  writeStore(PKCE_KEY, null, 'session');
  const tokens = await tokenRequest({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri(),
    code_verifier: pkce.verifier,
  });
  saveTokens(tokens);
  return pkce.returnTo && pkce.returnTo.startsWith('/') && !pkce.returnTo.startsWith('/auth') ? pkce.returnTo : '/book';
}

let refreshing: Promise<Tokens | null> | null = null;

async function refresh(): Promise<Tokens | null> {
  const current = readTokens();
  if (!current?.refreshToken) return null;
  if (!refreshing) {
    refreshing = tokenRequest({ grant_type: 'refresh_token', refresh_token: current.refreshToken })
      .then((t) => {
        // Cognito does not return a new refresh token on refresh; keep the old one.
        const next = { ...t, refreshToken: t.refreshToken ?? current.refreshToken };
        saveTokens(next);
        return next;
      })
      .catch(() => {
        saveTokens(null);
        return null;
      })
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
}

/** Returns a valid ID token, refreshing when it expires within a minute. Null when signed out. */
export async function getIdToken(force = false): Promise<string | null> {
  const t = readTokens();
  if (!t) return null;
  if (!force && t.expiresAt - Date.now() > 60_000) return t.idToken;
  const next = await refresh();
  return next?.idToken ?? null;
}

export async function logout(): Promise<void> {
  saveTokens(null);
  const cfg = await loadRuntimeConfig().catch(() => null);
  if (!cfg) {
    window.location.assign('/');
    return;
  }
  const params = new URLSearchParams({ client_id: cfg.clientId, logout_uri: `${window.location.origin}/` });
  window.location.assign(`${cfg.cognitoDomain}/logout?${params}`);
}
