import type { AstroCookies } from 'astro';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getRuntimeEnv } from './env';

export const ADMIN_COOKIE_NAME = 'op_admin_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const TOKEN_REGEX = /^(\d{13})\.(\d{13})\.([a-f0-9]{64})$/;
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function hmacSign(message: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return toHex(sig);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export function getAdminSecret(locals: unknown): string | undefined {
  return getRuntimeEnv(locals, 'ADMIN_PASSWORD');
}

export function getAdminApiKey(locals: unknown): string | undefined {
  return getRuntimeEnv(locals, 'ADMIN_API_KEY');
}

export async function createSessionToken(secret: string): Promise<string> {
  const iat = Date.now();
  const exp = iat + SESSION_TTL_MS;
  const sig = await hmacSign(`op-admin:${iat}:${exp}`, secret);
  return `${iat}.${exp}.${sig}`;
}

export async function verifySessionToken(token: string | undefined, secret: string): Promise<boolean> {
  if (!token) return false;
  const match = token.match(TOKEN_REGEX);
  if (!match) return false;
  const iat = Number(match[1]);
  const exp = Number(match[2]);
  const sig = match[3];
  const now = Date.now();
  if (exp <= iat || exp - iat > SESSION_TTL_MS || now > exp || iat > now + 60_000) {
    return false;
  }
  const expected = await hmacSign(`op-admin:${iat}:${exp}`, secret);
  return timingSafeEqual(sig, expected);
}

function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true; // Same-origin navigations / non-browser clients without Origin
  try {
    const reqOrigin = new URL(request.url).origin;
    return origin === reqOrigin;
  } catch {
    return false;
  }
}

export async function isAdminAuthenticated(
  request: Request,
  cookies: AstroCookies,
  locals: unknown
): Promise<{ ok: boolean; via?: 'cookie' | 'api_key'; error?: string }> {
  const authHeader = request.headers.get('authorization') || '';
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    const apiKey = getAdminApiKey(locals);
    const provided = authHeader.slice(7).trim();
    if (apiKey && timingSafeEqual(provided, apiKey)) {
      return { ok: true, via: 'api_key' };
    }
    return { ok: false, error: 'Bearer token inválido.' };
  }

  const secret = getAdminSecret(locals);
  if (!secret) {
    return { ok: false, error: 'ADMIN_PASSWORD não configurada no servidor.' };
  }

  const cookieVal = cookies.get(ADMIN_COOKIE_NAME)?.value;
  if (await verifySessionToken(cookieVal, secret)) {
    if (MUTATING_METHODS.has(request.method.toUpperCase()) && !isSameOriginRequest(request)) {
      return { ok: false, error: 'Origem CSRF inválida.' };
    }
    return { ok: true, via: 'cookie' };
  }

  return { ok: false, error: 'Não autorizado.' };
}

export function getServiceSupabase(locals: unknown): { client: SupabaseClient | null; error?: string } {
  const url = getRuntimeEnv(locals, 'PUBLIC_SUPABASE_URL');
  const serviceKey = getRuntimeEnv(locals, 'SUPABASE_SERVICE_ROLE_KEY');

  if (!url) {
    return { client: null, error: 'PUBLIC_SUPABASE_URL não configurada.' };
  }
  if (!serviceKey) {
    return {
      client: null,
      error: 'SUPABASE_SERVICE_ROLE_KEY não configurada nas variáveis do Worker/ambiente.',
    };
  }

  return {
    client: createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
  };
}

export const NOINDEX_HEADERS: Record<string, string> = {
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
  'Cache-Control': 'no-store',
};
