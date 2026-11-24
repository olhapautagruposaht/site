import type { APIRoute } from 'astro';
import {
  NOINDEX_HEADERS,
  getServiceSupabase,
  isAdminAuthenticated,
} from '../../../lib/admin-auth';
import { slugify } from '../../../lib/editorial-validator';
import { detectImageMimeFromMagicBytes } from '../../../lib/security';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

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
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return new Response(JSON.stringify({ ok: false, error: 'Arquivo não enviado (campo "file").' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...NOINDEX_HEADERS },
      });
    }

    if (file.size === 0 || file.size > MAX_IMAGE_BYTES) {
      return new Response(JSON.stringify({ ok: false, error: 'Imagem deve ter entre 1 byte e 10 MB.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...NOINDEX_HEADERS },
      });
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const realMime = detectImageMimeFromMagicBytes(bytes);
    if (!realMime) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Arquivo inválido. Apenas imagens reais WebP, JPG, PNG ou AVIF são aceitas.' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...NOINDEX_HEADERS } }
      );
    }

    const ext = realMime.split('/')[1].replace('jpeg', 'jpg');
    const baseName = slugify(file.name.replace(/\.[^.]+$/, '')) || 'capa';
    const now = new Date();
    const path = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${Date.now()}-${baseName}.${ext}`;

    const { error: uploadErr } = await client.storage
      .from('pautas-images')
      .upload(path, bytes, {
        contentType: realMime,
        cacheControl: '31536000',
        upsert: false,
      });

    if (uploadErr) {
      return new Response(JSON.stringify({ ok: false, error: uploadErr.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...NOINDEX_HEADERS },
      });
    }

    const { data: publicData } = client.storage.from('pautas-images').getPublicUrl(path);

    return new Response(JSON.stringify({ ok: true, url: publicData.publicUrl, path }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...NOINDEX_HEADERS },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: err instanceof Error ? err.message : 'Erro no upload.' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...NOINDEX_HEADERS } }
    );
  }
};
