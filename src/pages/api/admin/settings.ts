import type { APIRoute } from 'astro';
import {
  NOINDEX_HEADERS,
  getServiceSupabase,
  isAdminAuthenticated,
} from '../../../lib/admin-auth';
import { testAiConnection, type AiProvider, type AiSettings } from '../../../lib/ai-generator';

function maskKey(key?: string | null): string {
  if (!key) return '';
  if (key.length <= 10) return '••••••••';
  return `${key.slice(0, 6)}••••••${key.slice(-4)}`;
}

export const GET: APIRoute = async ({ request, cookies, locals }) => {
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

  const { data } = await client.from('admin_settings').select('*').eq('id', 'default').maybeSingle();

  return new Response(
    JSON.stringify({
      ok: true,
      settings: data
        ? {
            ai_provider: data.ai_provider,
            ai_model: data.ai_model,
            ai_base_url: data.ai_base_url || '',
            has_api_key: Boolean(data.ai_api_key),
            masked_api_key: maskKey(data.ai_api_key),
            has_search_key: Boolean(data.search_api_key),
            masked_search_key: maskKey(data.search_api_key),
            image_provider: data.image_provider || 'auto',
            image_model: data.image_model || 'imagen-3.0-generate-002',
            has_image_key: Boolean(data.image_api_key),
            masked_image_key: maskKey(data.image_api_key),
          }
        : {
            ai_provider: 'openai',
            ai_model: 'gpt-4o-mini',
            ai_base_url: '',
            has_api_key: false,
            masked_api_key: '',
          },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json', ...NOINDEX_HEADERS } }
  );
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
    const body = await request.json();
    const { data: existing } = await client
      .from('admin_settings')
      .select('ai_api_key, search_api_key, image_api_key')
      .eq('id', 'default')
      .maybeSingle();

    const apiKey = body.ai_api_key?.trim() || existing?.ai_api_key || null;
    const searchApiKey = body.search_api_key?.trim() || existing?.search_api_key || null;
    const imageApiKey = body.image_api_key?.trim() || existing?.image_api_key || null;

    const { error: dbErr } = await client.from('admin_settings').upsert({
      id: 'default',
      ai_provider: (body.ai_provider || 'openai') as AiProvider,
      ai_model: (body.ai_model || 'gpt-4o-mini').trim(),
      ai_api_key: apiKey,
      ai_base_url: body.ai_base_url?.trim() || null,
      search_api_key: searchApiKey,
      image_provider: body.image_provider || 'auto',
      image_model: (body.image_model || 'imagen-3.0-generate-002').trim(),
      image_api_key: imageApiKey,
    });

    if (dbErr) {
      return new Response(JSON.stringify({ ok: false, error: dbErr.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...NOINDEX_HEADERS },
      });
    }

    return new Response(
      JSON.stringify({ ok: true, masked_api_key: maskKey(apiKey), has_api_key: Boolean(apiKey) }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...NOINDEX_HEADERS } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: err instanceof Error ? err.message : 'Erro ao salvar configurações.' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...NOINDEX_HEADERS } }
    );
  }
};

export const PUT: APIRoute = async ({ request, cookies, locals }) => {
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
    let apiKey = body.ai_api_key?.trim();
    if (!apiKey && client) {
      const { data: existing } = await client
        .from('admin_settings')
        .select('ai_api_key')
        .eq('id', 'default')
        .maybeSingle();
      apiKey = existing?.ai_api_key || '';
    }

    const settings: AiSettings = {
      ai_provider: body.ai_provider || 'openai',
      ai_model: body.ai_model || 'gpt-4o-mini',
      ai_api_key: apiKey || '',
      ai_base_url: body.ai_base_url?.trim() || null,
    };

    const test = await testAiConnection(settings);
    return new Response(JSON.stringify(test), {
      status: test.ok ? 200 : 400,
      headers: { 'Content-Type': 'application/json', ...NOINDEX_HEADERS },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: err instanceof Error ? err.message : 'Erro no teste.' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...NOINDEX_HEADERS } }
    );
  }
};
