import type { APIRoute } from 'astro';
import {
  ADMIN_COOKIE_NAME,
  NOINDEX_HEADERS,
  createSessionToken,
  getAdminSecret,
  isSameOriginRequest,
} from '../../../lib/admin-auth';

export const POST: APIRoute = async ({ request, cookies, locals }) => {
  if (!isSameOriginRequest(request)) {
    return new Response(JSON.stringify({ ok: false, error: 'Origem inválida.' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json', ...NOINDEX_HEADERS },
    });
  }

  const secret = getAdminSecret(locals);
  if (!secret) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: 'ADMIN_PASSWORD ainda não configurada nas variáveis do Worker na Cloudflare.',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...NOINDEX_HEADERS } }
    );
  }

  try {
    const body = await request.json();
    const password = String(body?.password || '');

    if (!password || password !== secret) {
      return new Response(JSON.stringify({ ok: false, error: 'Senha incorreta.' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...NOINDEX_HEADERS },
      });
    }

    const token = await createSessionToken(secret);
    const isHttps = new URL(request.url).protocol === 'https:';

    cookies.set(ADMIN_COOKIE_NAME, token, {
      httpOnly: true,
      secure: isHttps,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    });

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...NOINDEX_HEADERS },
    });
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'Requisição inválida.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...NOINDEX_HEADERS },
    });
  }
};

export const DELETE: APIRoute = async ({ cookies }) => {
  cookies.delete(ADMIN_COOKIE_NAME, { path: '/' });
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...NOINDEX_HEADERS },
  });
};
