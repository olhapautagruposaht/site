import type { AstroCookies } from 'astro';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getRuntimeEnv } from './env';

export const ADMIN_COOKIE_NAME = 'op_admin_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

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
  const exp = String(Date.now() + SESSION_TTL_MS);
  const sig = await hmacSign(`op-admin:${exp}`, secret);
  return `${exp}.${sig}`;
}

export async function verifySessionToken(token: string | undefined, secret: string): Promise<boolean> {
  if (!token || !token.includes('.')) return false;
  const [exp, sig] = token.split('.');
  if (!exp || !sig) return false;
  const expNum = Number(exp);
  if (!Number.isFinite(expNum) || Date.now() > expNum) return false;
  const expected = await hmacSign(`op-admin:${exp}`, secret);
  return timingSafeEqual(sig, expected);
}

export async function isAdminAuthenticated(
  request: Request,
  cookies: AstroCookies,
  locals: unknown
): Promise<{ ok: boolean; via?: 'cookie' | 'api_key'; error?: string }> {
  const apiKey = getAdminApiKey(locals);
  const authHeader = request.headers.get('authorization') || '';
  if (apiKey && authHeader.toLowerCase().startsWith('bearer ')) {
    const provided = authHeader.slice(7).trim();
    if (timingSafeEqual(provided, apiKey)) {
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
