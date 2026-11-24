import type { APIRoute } from 'astro';
import { NOINDEX_HEADERS, getServiceSupabase, isAdminAuthenticated } from '../../../lib/admin-auth';

const INDEXNOW_KEY = '9f4c2a8e1b7d4065a3c9e2f8d1b4a6c0';

/**
 * Endpoint chamado pelo cron (GitHub Actions nos horários nobres 08h05, 12h35, 18h35 BRT)
 * para avisar o IndexNow assim que uma pauta agendada entra no ar automaticamente.
 */
export const POST: APIRoute = async ({ request, cookies, locals }) => {
  const auth = await isAdminAuthenticated(request, cookies, locals);
  if (!auth.ok) {
    return new Response(JSON.stringify({ ok: false, error: auth.error }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', ...NOINDEX_HEADERS },
    });
  }

  const { client, error } = getServiceSupabase(locals);
  if (!client) {
    return new Response(JSON.stringify({ ok: false, error }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...NOINDEX_HEADERS },
    });
  }

  const now = new Date();
  const windowStart = new Date(now.getTime() - 45 * 60 * 1000).toISOString();
  const nowIso = now.toISOString();

  const { data, error: dbErr } = await client
    .from('pautas')
    .select('slug, titulo, published_at')
    .eq('status', 'published')
    .gte('published_at', windowStart)
    .lte('published_at', nowIso)
    .limit(10);

  if (dbErr) {
    return new Response(JSON.stringify({ ok: false, error: dbErr.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...NOINDEX_HEADERS },
    });
  }

  const rows = data || [];
  if (rows.length === 0) {
    return new Response(JSON.stringify({ ok: true, notified: 0, urls: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...NOINDEX_HEADERS },
    });
  }

  const urlList = [
    ...rows.map((r) => `https://olhapauta.com.br/pauta/${r.slug}`),
    'https://olhapauta.com.br/',
  ];

  let indexNowOk = false;
  try {
    const res = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        host: 'olhapauta.com.br',
        key: INDEXNOW_KEY,
        keyLocation: `https://olhapauta.com.br/${INDEXNOW_KEY}.txt`,
        urlList,
      }),
    });
    indexNowOk = res.ok;
  } catch {
    indexNowOk = false;
  }

  return new Response(
    JSON.stringify({
      ok: true,
      notified: rows.length,
      indexNowOk,
      urls: urlList,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json', ...NOINDEX_HEADERS } }
  );
};
