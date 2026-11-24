import type { APIRoute } from 'astro';

const INDEXNOW_KEY = '9f4c2a8e1b7d4065a3c9e2f8d1b4a6c0';
const HOST = 'olhapauta.com.br';

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const urls: string[] = Array.isArray(body?.urls)
      ? body.urls.filter((u: unknown) => typeof u === 'string' && u.startsWith(`https://${HOST}/`))
      : [];

    if (urls.length === 0) {
      return new Response(JSON.stringify({ ok: false, error: 'Informe ao menos uma URL de olhapauta.com.br' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const res = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        host: HOST,
        key: INDEXNOW_KEY,
        keyLocation: `https://${HOST}/${INDEXNOW_KEY}.txt`,
        urlList: urls,
      }),
    });

    return new Response(
      JSON.stringify({ ok: res.ok, status: res.status, submitted: urls.length }),
      {
        status: res.ok ? 200 : 502,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'Erro ao enviar para o IndexNow' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
