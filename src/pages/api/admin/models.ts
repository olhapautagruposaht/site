import type { APIRoute } from 'astro';
import {
  NOINDEX_HEADERS,
  getServiceSupabase,
  isAdminAuthenticated,
} from '../../../lib/admin-auth';
import { assertSafeExternalUrl } from '../../../lib/security';

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
        .select('ai_provider, ai_api_key, provider_keys')
        .eq('id', 'default')
        .maybeSingle();
      const vault = (data?.provider_keys as Record<string, string> | null) || {};
      if (vault[provider]?.trim()) {
        apiKey = vault[provider].trim();
      } else if (data?.ai_provider === provider && data?.ai_api_key) {
        apiKey = data.ai_api_key;
      }
    }

    if (!apiKey && provider !== 'opencode') {
      return new Response(
        JSON.stringify({ ok: false, error: `Cole ou salve uma API Key de "${provider}" primeiro para listar os modelos.` }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...NOINDEX_HEADERS } }
      );
    }

    let models: string[] = [];

    if (provider === 'gemini') {
      const res = await fetch(
        'https://generativelanguage.googleapis.com/v1beta/models?pageSize=100',
        {
          signal: AbortSignal.timeout(12000),
          headers: { 'x-goog-api-key': apiKey },
        }
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
        deepseek: 'https://api.deepseek.com/v1/models',
        openrouter: 'https://openrouter.ai/api/v1/models',
        opencode: 'https://opencode.ai/zen/v1/models',
        opencode_go: 'https://opencode.ai/zen/go/v1/models',
        custom: `${baseUrl.replace(/\/+$/, '')}/models`,
      };
      let url = endpoints[provider];
      if (provider === 'custom') {
        if (!baseUrl) throw new Error('Informe a Base URL para listar modelos.');
        const safe = assertSafeExternalUrl(baseUrl, { allowHttpInDev: true });
        url = `${safe.toString().replace(/\/+$/, '')}/models`;
      }
      if (!url || url === '/models') throw new Error('Informe a Base URL para listar modelos.');
      const res = await fetch(url, {
        signal: AbortSignal.timeout(12000),
        headers: { Authorization: `Bearer ${apiKey || 'public'}` },
      });
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
