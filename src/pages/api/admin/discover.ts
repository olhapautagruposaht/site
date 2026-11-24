import type { APIRoute } from 'astro';
import {
  NOINDEX_HEADERS,
  getServiceSupabase,
  isAdminAuthenticated,
} from '../../../lib/admin-auth';
import { discoverTrendingTopics, type AiSettings } from '../../../lib/ai-generator';
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
          error: 'Configure sua chave de API primeiro em Minha IA (API).',
        }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...NOINDEX_HEADERS } }
      );
    }

    const body = await request.json().catch(() => ({}));
    const trilha = (body?.trilha || 'all') as TrilhaSlug | 'all';

    const { suggestions, webSearchUsed } = await discoverTrendingTopics(
      settings as AiSettings,
      trilha
    );

    return new Response(JSON.stringify({ ok: true, suggestions, webSearchUsed }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...NOINDEX_HEADERS },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: err instanceof Error ? err.message : 'Erro ao buscar tendências.' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...NOINDEX_HEADERS } }
    );
  }
};
