import type { APIRoute } from 'astro';
import {
  NOINDEX_HEADERS,
  getServiceSupabase,
  isAdminAuthenticated,
} from '../../../lib/admin-auth';
import { slugify } from '../../../lib/editorial-validator';

const FREE_LICENSES = ['cc0', 'public domain', 'cc by', 'cc-by', 'pd-'];

function stripTags(html?: string): string {
  return (html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function isCommercialFreeLicense(license: string): boolean {
  const l = license.toLowerCase();
  if (l.includes('nc') || l.includes('nd') || l.includes('fair use') || l.includes('copyrighted')) {
    return false;
  }
  return FREE_LICENSES.some((ok) => l.includes(ok));
}

function buildSearchTerms(titulo: string, trilha: string, customQuery?: string): string {
  if (customQuery?.trim()) return customQuery.trim();
  const lower = `${titulo} ${trilha}`.toLowerCase();
  const map: [RegExp, string][] = [
    [/openai|chatgpt|gpt/, 'OpenAI artificial intelligence technology'],
    [/google|gemini/, 'Google technology office silicon valley'],
    [/apple|iphone|mac/, 'Apple technology smartphone laptop'],
    [/whatsapp|celular|smartphone|android/, 'smartphone technology hand modern'],
    [/seguran|golpe|deepfake|cyber|hacker|privacidade|vazamento/, 'cybersecurity server network security'],
    [/chip|gpu|nvidia|hardware|datacenter|servidor/, 'data center server hardware microchip'],
    [/agente|autonom|automac|trabalho|empresa|negocio|saas/, 'modern technology office laptop workspace'],
    [/robo|robot/, 'humanoid robot technology laboratory'],
    [/ia|inteligencia artificial|modelo|llm/, 'artificial intelligence computer technology server'],
  ];
  for (const [re, terms] of map) {
    if (re.test(lower)) return terms;
  }
  return 'modern technology computer office';
}

export const POST: APIRoute = async ({ request, cookies, locals }) => {
  const auth = await isAdminAuthenticated(request, cookies, locals);
  if (!auth.ok) {
    return new Response(JSON.stringify({ ok: false, error: auth.error }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', ...NOINDEX_HEADERS },
    });
  }

  try {
    const body = await request.json();

    // Mode 2: Import a selected free image into our own Supabase Storage bucket (fast CDN + permanent URL)
    if (body?.importUrl) {
      const { client, error } = getServiceSupabase(locals);
      if (!client) {
        return new Response(JSON.stringify({ ok: false, error }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...NOINDEX_HEADERS },
        });
      }

      const imgRes = await fetch(String(body.importUrl), {
        headers: { 'User-Agent': 'OlhaPautaCMS/1.0 (+https://olhapauta.com.br)' },
      });
      if (!imgRes.ok) {
        return new Response(
          JSON.stringify({ ok: false, error: `Não foi possível baixar a imagem (HTTP ${imgRes.status}).` }),
          { status: 400, headers: { 'Content-Type': 'application/json', ...NOINDEX_HEADERS } }
        );
      }

      const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
      const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
      const bytes = new Uint8Array(await imgRes.arrayBuffer());
      const now = new Date();
      const baseName = slugify(String(body.titulo || 'capa-editorial')).slice(0, 48) || 'capa';
      const path = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${Date.now()}-${baseName}.${ext}`;

      const { error: upErr } = await client.storage
        .from('pautas-images')
        .upload(path, bytes, { contentType, cacheControl: '31536000', upsert: false });

      if (upErr) {
        return new Response(JSON.stringify({ ok: false, error: upErr.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...NOINDEX_HEADERS },
        });
      }

      const { data: pub } = client.storage.from('pautas-images').getPublicUrl(path);
      return new Response(JSON.stringify({ ok: true, url: pub.publicUrl }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...NOINDEX_HEADERS },
      });
    }

    // Mode 1: Search commercial-free landscape high-res photos on Wikimedia Commons
    const titulo = String(body?.titulo || '').trim();
    const trilha = String(body?.trilha || 'ia').trim();
    const query = buildSearchTerms(titulo, trilha, body?.query);

    const apiUrl = new URL('https://commons.wikimedia.org/w/api.php');
    apiUrl.searchParams.set('action', 'query');
    apiUrl.searchParams.set('generator', 'search');
    apiUrl.searchParams.set('gsrnamespace', '6');
    apiUrl.searchParams.set('gsrsearch', `${query} filetype:bitmap`);
    apiUrl.searchParams.set('gsrlimit', '20');
    apiUrl.searchParams.set('prop', 'imageinfo');
    apiUrl.searchParams.set('iiprop', 'url|size|extmetadata|mime');
    apiUrl.searchParams.set('iiurlwidth', '1600');
    apiUrl.searchParams.set('format', 'json');

    const res = await fetch(apiUrl.toString(), {
      headers: { 'User-Agent': 'OlhaPautaCMS/1.0 (+https://olhapauta.com.br)' },
    });
    if (!res.ok) {
      throw new Error(`Wikimedia HTTP ${res.status}`);
    }

    const data = (await res.json()) as {
      query?: {
        pages?: Record<
          string,
          {
            title?: string;
            imageinfo?: {
              url?: string;
              thumburl?: string;
              width?: number;
              height?: number;
              mime?: string;
              extmetadata?: {
                LicenseShortName?: { value?: string };
                Artist?: { value?: string };
                ImageDescription?: { value?: string };
              };
            }[];
          }
        >;
      };
    };

    const pages = Object.values(data.query?.pages || {});
    const results = pages
      .map((p) => {
        const info = p.imageinfo?.[0];
        if (!info?.url || !info.width || !info.height) return null;
        if (info.mime && !['image/jpeg', 'image/png', 'image/webp'].includes(info.mime)) return null;
        // Landscape high-res filter for Google Discover (>= 1000px wide, landscape ratio)
        const ratio = info.width / info.height;
        if (info.width < 1000 || ratio < 1.2 || ratio > 2.4) return null;

        const license = stripTags(info.extmetadata?.LicenseShortName?.value || '');
        if (!isCommercialFreeLicense(license)) return null;

        const artist = stripTags(info.extmetadata?.Artist?.value || 'Wikimedia Commons').slice(0, 60);
        const cleanFileTitle = (p.title || '').replace(/^File:/i, '').replace(/\.[^.]+$/, '');
        const suggestedAlt = titulo
          ? `Imagem ilustrativa da pauta: ${titulo}`
          : cleanFileTitle;

        return {
          title: cleanFileTitle,
          url: info.thumburl || info.url,
          width: info.width,
          height: info.height,
          license,
          credit: `Foto: ${artist} / ${license} (Wikimedia Commons)`,
          suggestedAlt,
        };
      })
      .filter(Boolean)
      .slice(0, 6);

    return new Response(JSON.stringify({ ok: true, query, results }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...NOINDEX_HEADERS },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: err instanceof Error ? err.message : 'Erro ao buscar imagens.' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...NOINDEX_HEADERS } }
    );
  }
};
