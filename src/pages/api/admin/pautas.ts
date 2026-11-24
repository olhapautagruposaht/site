import type { APIRoute } from 'astro';
import {
  NOINDEX_HEADERS,
  getServiceSupabase,
  isAdminAuthenticated,
} from '../../../lib/admin-auth';
import {
  TRILHA_LABELS,
  evaluatePautaQuality,
  slugify,
  type PautaPayload,
} from '../../../lib/editorial-validator';

const INDEXNOW_KEY = '9f4c2a8e1b7d4065a3c9e2f8d1b4a6c0';

async function notifyIndexNow(slug: string): Promise<boolean> {
  try {
    const res = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        host: 'olhapauta.com.br',
        key: INDEXNOW_KEY,
        keyLocation: `https://olhapauta.com.br/${INDEXNOW_KEY}.txt`,
        urlList: [`https://olhapauta.com.br/pauta/${slug}`, 'https://olhapauta.com.br/'],
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export const GET: APIRoute = async ({ request, cookies, locals, url }) => {
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

  const id = url.searchParams.get('id');
  if (id) {
    const { data, error: dbErr } = await client.from('pautas').select('*').eq('id', id).maybeSingle();
    if (dbErr) {
      return new Response(JSON.stringify({ ok: false, error: dbErr.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...NOINDEX_HEADERS },
      });
    }
    return new Response(JSON.stringify({ ok: true, pauta: data }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...NOINDEX_HEADERS },
    });
  }

  const { data, error: dbErr } = await client
    .from('pautas')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);

  if (dbErr) {
    return new Response(JSON.stringify({ ok: false, error: dbErr.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...NOINDEX_HEADERS },
    });
  }

  return new Response(JSON.stringify({ ok: true, pautas: data || [] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...NOINDEX_HEADERS },
  });
};

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

  try {
    const payload = (await request.json()) as PautaPayload & { force?: boolean };
    const status = payload.status || 'draft';
    const quality = evaluatePautaQuality(payload);

    // Block publishing if critical quality rules fail (unless force=true)
    if (status === 'published' && quality.blockers.length > 0 && !payload.force) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: 'Pauta reprovada no Quality Gate antes de publicar.',
          blockers: quality.blockers,
          quality,
        }),
        { status: 422, headers: { 'Content-Type': 'application/json', ...NOINDEX_HEADERS } }
      );
    }

    const trilha = payload.trilha || 'ia';
    const slug = (payload.slug ? slugify(payload.slug) : slugify(payload.titulo || '')) || `pauta-${Date.now()}`;

    const record: Record<string, unknown> = {
      slug,
      trilha,
      trilha_label: payload.trilha_label || TRILHA_LABELS[trilha] || 'IA',
      status,
      destaque: Boolean(payload.destaque),
      titulo: (payload.titulo || '').trim(),
      subtitulo: (payload.subtitulo || '').trim(),
      resumo_curto: (payload.resumo_curto || payload.subtitulo || '').trim(),
      tldr: Array.isArray(payload.tldr) ? payload.tldr.filter((t) => t && t.trim()) : [],
      conteudo: Array.isArray(payload.conteudo) ? payload.conteudo : [],
      faqs: Array.isArray(payload.faqs)
        ? payload.faqs.filter((f) => f?.pergunta?.trim() && f?.resposta?.trim())
        : [],
      tags: Array.isArray(payload.tags) ? payload.tags.map((t) => t.trim().toUpperCase()).filter(Boolean) : [],
      tempo_leitura: payload.tempo_leitura || quality.estimatedReadTime,
      autor_nome: (payload.autor_nome || 'Jonathas Costa').trim(),
      autor_cargo: (payload.autor_cargo || 'Fundador & Editor').trim(),
      imagem_url: (payload.imagem_url || '').trim(),
      imagem_alt: (payload.imagem_alt || payload.titulo || '').trim(),
      imagem_credito: (payload.imagem_credito || 'Editorial OlhaPauta').trim(),
      video_url: payload.video_url?.trim() || null,
      source_urls: Array.isArray(payload.source_urls)
        ? payload.source_urls.map((u) => u.trim()).filter(Boolean)
        : [],
    };

    if (status === 'published') {
      record.published_at = new Date().toISOString();
    }

    let result;
    if (payload.id) {
      result = await client.from('pautas').update(record).eq('id', payload.id).select('*').single();
    } else {
      result = await client.from('pautas').insert(record).select('*').single();
    }

    if (result.error) {
      return new Response(JSON.stringify({ ok: false, error: result.error.message }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...NOINDEX_HEADERS },
      });
    }

    let indexNowSent = false;
    if (status === 'published' && result.data?.slug) {
      indexNowSent = await notifyIndexNow(result.data.slug);
    }

    return new Response(
      JSON.stringify({
        ok: true,
        pauta: result.data,
        quality,
        indexNowSent,
        url: `https://olhapauta.com.br/pauta/${result.data.slug}`,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...NOINDEX_HEADERS } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: err instanceof Error ? err.message : 'Erro ao salvar pauta.' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...NOINDEX_HEADERS } }
    );
  }
};

export const DELETE: APIRoute = async ({ request, cookies, locals, url }) => {
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

  const id = url.searchParams.get('id');
  if (!id) {
    return new Response(JSON.stringify({ ok: false, error: 'ID não informado.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...NOINDEX_HEADERS },
    });
  }

  const { error: dbErr } = await client.from('pautas').delete().eq('id', id);
  if (dbErr) {
    return new Response(JSON.stringify({ ok: false, error: dbErr.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...NOINDEX_HEADERS },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...NOINDEX_HEADERS },
  });
};
