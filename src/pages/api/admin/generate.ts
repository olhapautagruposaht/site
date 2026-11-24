import type { APIRoute } from 'astro';
import {
  NOINDEX_HEADERS,
  getServiceSupabase,
  isAdminAuthenticated,
} from '../../../lib/admin-auth';
import { generatePautaDraft, type AiSettings } from '../../../lib/ai-generator';
import type { TrilhaSlug } from '../../../data/pautas';

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
    const { data: settings, error: cfgErr } = await client
      .from('admin_settings')
      .select('*')
      .eq('id', 'default')
      .maybeSingle();

    if (cfgErr || !settings?.ai_api_key) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: 'Configure sua chave de API primeiro em Configurações → IA.',
        }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...NOINDEX_HEADERS } }
      );
    }

    const body = await request.json();
    const topic = String(body?.topic || '').trim();
    if (topic.length < 5) {
      return new Response(JSON.stringify({ ok: false, error: 'Informe um tema ou pauta para gerar.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...NOINDEX_HEADERS },
      });
    }

    const trilha = (body?.trilha || 'ia') as TrilhaSlug;
    const foco = body?.foco === 'search' ? 'search' : 'discover';
    const useWebSearch = body?.use_web_search !== false;
    const sourceUrls: string[] = Array.isArray(body?.source_urls)
      ? body.source_urls.filter((u: unknown) => typeof u === 'string' && u.trim())
      : [];

    const { draft, webSearchUsed } = await generatePautaDraft(settings as AiSettings, {
      topic,
      trilha,
      foco,
      sourceUrls,
      useWebSearch,
    });

    return new Response(JSON.stringify({ ok: true, draft, webSearchUsed }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...NOINDEX_HEADERS },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: err instanceof Error ? err.message : 'Erro ao gerar rascunho.' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...NOINDEX_HEADERS } }
    );
  }
};
