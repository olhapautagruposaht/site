import type { APIRoute } from 'astro';
import {
  NOINDEX_HEADERS,
  getServiceSupabase,
  isAdminAuthenticated,
} from '../../../lib/admin-auth';

export const POST: APIRoute = async ({ request, cookies, locals }) => {
  const auth = await isAdminAuthenticated(request, cookies, locals);
  if (!auth.ok) {
    return new Response(JSON.stringify({ ok: false, error: auth.error }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', ...NOINDEX_HEADERS },
    });
  }

  const { client } = getServiceSupabase(locals);
  try {
    const body = await request.json();
    const provider = String(body?.ai_provider || 'gemini');
    const baseUrl = String(body?.ai_base_url || '').trim();
    let apiKey = String(body?.ai_api_key || '').trim();

    if (!apiKey && client) {
      const { data } = await client
        .from('admin_settings')
        .select('ai_api_key')
        .eq('id', 'default')
        .maybeSingle();
      apiKey = data?.ai_api_key || '';
    }

    if (!apiKey) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Cole ou salve uma API Key primeiro para listar os modelos.' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...NOINDEX_HEADERS } }
      );
    }

    let models: string[] = [];

    if (provider === 'gemini') {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}&pageSize=100`
      );
      if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);
      const data = (await res.json()) as {
        models?: { name?: string; supportedGenerationMethods?: string[] }[];
      };
      models = (data.models || [])
        .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
        .map((m) => (m.name || '').replace(/^models\//, ''))
        .filter(
          (id) =>
            id.includes('gemini') &&
            !/gemini-(1\.|2\.0|2\.5)/i.test(id) &&
            !/(embedding|image|tts|audio|robotics|computer-use|deep-research)/i.test(id)
        )
        .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    } else if (provider === 'anthropic') {
      const res = await fetch('https://api.anthropic.com/v1/models', {
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      });
      if (!res.ok) throw new Error(`Anthropic HTTP ${res.status}`);
      const data = (await res.json()) as { data?: { id?: string }[] };
      models = (data.data || []).map((m) => m.id || '').filter(Boolean);
    } else {
      const endpoints: Record<string, string> = {
        openai: 'https://api.openai.com/v1/models',
        grok: 'https://api.x.ai/v1/models',
        openrouter: 'https://openrouter.ai/api/v1/models',
        custom: `${baseUrl.replace(/\/+$/, '')}/models`,
      };
      const url = endpoints[provider];
      if (!url || url === '/models') throw new Error('Informe a Base URL para listar modelos.');
      const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
      if (!res.ok) throw new Error(`${provider} HTTP ${res.status}`);
      const data = (await res.json()) as { data?: { id?: string }[] };
      models = (data.data || []).map((m) => m.id || '').filter(Boolean).slice(0, 60);
    }

    return new Response(JSON.stringify({ ok: true, models: models.slice(0, 40) }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...NOINDEX_HEADERS },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: err instanceof Error ? err.message : 'Erro ao listar modelos.' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...NOINDEX_HEADERS } }
    );
  }
};
