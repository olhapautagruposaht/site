import type { APIRoute } from 'astro';
import {
  NOINDEX_HEADERS,
  getServiceSupabase,
  isAdminAuthenticated,
} from '../../../lib/admin-auth';
import { generateCoverImage, type AiSettings } from '../../../lib/ai-generator';
import { slugify } from '../../../lib/editorial-validator';

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

    const effectiveSettings = (settings || {
      ai_provider: 'gemini',
      ai_model: 'gemini-3.8-flash',
      ai_api_key: '',
      image_provider: 'cloudflare',
      image_model: '@cf/black-forest-labs/flux-1-schnell',
    }) as AiSettings;

    const needsKey = effectiveSettings.image_provider !== 'cloudflare';
    if (cfgErr && needsKey) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: 'Configure o provedor de imagem em Minha IA (API) — ou escolha Cloudflare Workers AI (grátis, sem chave).',
        }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...NOINDEX_HEADERS } }
      );
    }

    const body = await request.json();
    const titulo = String(body?.titulo || '').trim();
    const trilha = String(body?.trilha || 'ia').trim();
    const customPrompt = String(body?.prompt || '').trim();

    if (!titulo && !customPrompt) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Preencha o título da pauta ou um prompt visual antes de gerar a capa.' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...NOINDEX_HEADERS } }
      );
    }

    const generated = await generateCoverImage(effectiveSettings, {
      titulo: titulo || customPrompt,
      trilha,
      customPrompt: customPrompt || undefined,
    });

    const now = new Date();
    const baseName = slugify(titulo || customPrompt).slice(0, 48) || 'capa-ia';
    const path = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${Date.now()}-${baseName}.${generated.ext}`;

    const { error: uploadErr } = await client.storage
      .from('pautas-images')
      .upload(path, generated.bytes, {
        contentType: generated.contentType,
        cacheControl: '31536000',
        upsert: false,
      });

    if (uploadErr) {
      return new Response(JSON.stringify({ ok: false, error: `Falha ao salvar no Storage: ${uploadErr.message}` }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...NOINDEX_HEADERS },
      });
    }

    const { data: publicData } = client.storage.from('pautas-images').getPublicUrl(path);

    return new Response(
      JSON.stringify({
        ok: true,
        url: publicData.publicUrl,
        path,
        providerUsed: generated.providerUsed,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...NOINDEX_HEADERS } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: err instanceof Error ? err.message : 'Erro ao gerar capa.' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...NOINDEX_HEADERS } }
    );
  }
};
