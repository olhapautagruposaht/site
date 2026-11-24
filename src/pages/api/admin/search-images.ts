import type { APIRoute } from 'astro';
import {
  NOINDEX_HEADERS,
  getServiceSupabase,
  isAdminAuthenticated,
} from '../../../lib/admin-auth';
import { slugify } from '../../../lib/editorial-validator';
import {
  assertSafeExternalUrl,
  detectImageMimeFromMagicBytes,
  readResponseBytesWithLimit,
} from '../../../lib/security';

const FREE_LICENSES = ['cc0', 'public domain', 'cc by', 'cc-by', 'pd-'];
const ALLOWED_IMAGE_HOSTS = [
  'images.pexels.com',
  'pixabay.com',
  'cdn.pixabay.com',
  'upload.wikimedia.org',
  'thumb.wikimedia.org',
  'commons.wikimedia.org',
];
const MAX_IMPORT_BYTES = 10 * 1024 * 1024;

function translatePtQuery(q: string): string {
  const normalized = q.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const dict: Record<string, string> = {
    ciberseguranca: 'cybersecurity',
    seguranca: 'cybersecurity technology',
    'inteligencia artificial': 'artificial intelligence technology',
    ia: 'artificial intelligence',
    tecnologia: 'modern technology',
    negocios: 'modern business office technology',
    empresa: 'corporate office laptop',
    celular: 'smartphone technology',
    golpe: 'cybersecurity digital lock',
    privacidade: 'digital privacy cybersecurity',
    servidor: 'data center server',
    trabalho: 'modern workspace laptop',
    robo: 'robot technology',
  };
  return dict[normalized] || q.trim();
}

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

function buildSearchTerms(titulo: string, trilha: string, customQuery?: string): string[] {
  if (customQuery?.trim()) return [translatePtQuery(customQuery)];
  const lower = `${titulo} ${trilha}`.toLowerCase();
  const map: [RegExp, string[]][] = [
    [/openai|chatgpt|gpt/, ['artificial intelligence', 'data center', 'server room']],
    [/google|gemini/, ['Googleplex', 'data center', 'technology office']],
    [/apple|iphone|mac/, ['Apple Park', 'iPhone', 'MacBook']],
    [/whatsapp|celular|smartphone|android/, ['smartphone', 'mobile phone', 'hand holding phone']],
    [/seguran|golpe|deepfake|cyber|hacker|privacidade|vazamento|ransomware/, ['cybersecurity', 'server room', 'network rack']],
    [/chip|gpu|nvidia|hardware|datacenter|servidor/, ['data center', 'microchip', 'server room']],
    [/agente|autonom|automac|trabalho|empresa|negocio|saas/, ['modern office', 'laptop desk', 'software developer']],
    [/robo|robot/, ['humanoid robot', 'robotics laboratory', 'robot']],
    [/ia|inteligencia artificial|modelo|llm/, ['data center', 'supercomputer', 'server room']],
  ];
  for (const [re, terms] of map) {
    if (re.test(lower)) return terms;
  }
  return ['data center', 'modern office', 'laptop'];
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

      const safeUrl = assertSafeExternalUrl(String(body.importUrl), {
        allowHosts: ALLOWED_IMAGE_HOSTS,
      });

      const imgRes = await fetch(safeUrl.toString(), {
        redirect: 'error',
        signal: AbortSignal.timeout(12000),
        headers: { 'User-Agent': 'OlhaPautaCMS/1.0 (+https://olhapauta.com.br)' },
      });
      if (!imgRes.ok) {
        return new Response(
          JSON.stringify({ ok: false, error: `Não foi possível baixar a imagem (HTTP ${imgRes.status}).` }),
          { status: 400, headers: { 'Content-Type': 'application/json', ...NOINDEX_HEADERS } }
        );
      }

      const bytes = await readResponseBytesWithLimit(imgRes, MAX_IMPORT_BYTES);
      const realMime = detectImageMimeFromMagicBytes(bytes);
      if (!realMime) {
        return new Response(
          JSON.stringify({ ok: false, error: 'O arquivo baixado não é uma imagem válida (JPG/PNG/WebP/AVIF).' }),
          { status: 400, headers: { 'Content-Type': 'application/json', ...NOINDEX_HEADERS } }
        );
      }

      const ext = realMime.split('/')[1].replace('jpeg', 'jpg');
      const now = new Date();
      const baseName = slugify(String(body.titulo || 'capa-editorial')).slice(0, 48) || 'capa';
      const path = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${Date.now()}-${baseName}.${ext}`;

      const { error: upErr } = await client.storage
        .from('pautas-images')
        .upload(path, bytes, { contentType: realMime, cacheControl: '31536000', upsert: false });

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

    // Mode 1: Prefer Pexels API (high-craft free editorial landscape photography) if configured, else Wikimedia Commons
    const titulo = String(body?.titulo || '').trim();
    const trilha = String(body?.trilha || 'ia').trim();
    const queries = buildSearchTerms(titulo, trilha, body?.query);

    const { client } = getServiceSupabase(locals);
    let pexelsKey = '';
    let pixabayKey = '';
    if (client) {
      const { data: cfg } = await client
        .from('admin_settings')
        .select('provider_keys')
        .eq('id', 'default')
        .maybeSingle();
      const vault = (cfg?.provider_keys as Record<string, string> | null) || {};
      pexelsKey = vault.pexels?.trim() || '';
      pixabayKey = vault.pixabay?.trim() || '';
    }

    if (pixabayKey) {
      const q = queries[0];
      const pbUrl = new URL('https://pixabay.com/api/');
      pbUrl.searchParams.set('key', pixabayKey);
      pbUrl.searchParams.set('q', q);
      pbUrl.searchParams.set('image_type', 'photo');
      pbUrl.searchParams.set('orientation', 'horizontal');
      pbUrl.searchParams.set('min_width', '1280');
      pbUrl.searchParams.set('safesearch', 'true');
      pbUrl.searchParams.set('per_page', '9');

      const pbRes = await fetch(pbUrl.toString(), { signal: AbortSignal.timeout(8000) });
      if (pbRes.ok) {
        const pbData = (await pbRes.json()) as {
          hits?: {
            largeImageURL?: string;
            imageWidth?: number;
            imageHeight?: number;
            user?: string;
            tags?: string;
          }[];
        };
        const results = (pbData.hits || [])
          .filter((h) => {
            if (!h.largeImageURL || (h.imageWidth || 0) <= (h.imageHeight || 0)) return false;
            try {
              assertSafeExternalUrl(h.largeImageURL, { allowHosts: ALLOWED_IMAGE_HOSTS });
              return true;
            } catch {
              return false;
            }
          })
          .slice(0, 6)
          .map((h) => ({
            title: h.tags || titulo || q,
            url: h.largeImageURL || '',
            width: h.imageWidth || 1280,
            height: h.imageHeight || 720,
            license: 'Pixabay Free',
            credit: `Foto: ${h.user || 'Pixabay'} / Pixabay`,
            suggestedAlt: titulo ? `Imagem editorial da pauta: ${titulo}` : h.tags || q,
          }));
        if (results.length > 0) {
          return new Response(JSON.stringify({ ok: true, query: q, source: 'pixabay', results }), {
            status: 200,
            headers: { 'Content-Type': 'application/json', ...NOINDEX_HEADERS },
          });
        }
      }
    }

    if (pexelsKey) {
      const q = queries[0];
      const pxUrl = new URL('https://api.pexels.com/v1/search');
      pxUrl.searchParams.set('query', q);
      pxUrl.searchParams.set('orientation', 'landscape');
      pxUrl.searchParams.set('size', 'large');
      pxUrl.searchParams.set('per_page', '9');

      const pxRes = await fetch(pxUrl.toString(), {
        signal: AbortSignal.timeout(8000),
        headers: { Authorization: pexelsKey },
      });

      if (pxRes.ok) {
        const pxData = (await pxRes.json()) as {
          photos?: {
            width: number;
            height: number;
            photographer: string;
            alt?: string;
            src: { large2x?: string; landscape?: string; original?: string };
          }[];
        };
        const results = (pxData.photos || [])
          .filter((p) => p.width >= 1200 && p.width > p.height)
          .slice(0, 6)
          .map((p) => ({
            title: p.alt || titulo || q,
            url: p.src.large2x || p.src.landscape || p.src.original || '',
            width: p.width,
            height: p.height,
            license: 'Pexels Free',
            credit: `Foto: ${p.photographer} / Pexels`,
            suggestedAlt: titulo ? `Imagem editorial da pauta: ${titulo}` : p.alt || q,
          }))
          .filter((r) => Boolean(r.url));

        if (results.length > 0) {
          return new Response(JSON.stringify({ ok: true, query: q, source: 'pexels', results }), {
            status: 200,
            headers: { 'Content-Type': 'application/json', ...NOINDEX_HEADERS },
          });
        }
      }
    }

    const searchWikimedia = async (q: string) => {
      const apiUrl = new URL('https://commons.wikimedia.org/w/api.php');
      apiUrl.searchParams.set('action', 'query');
      apiUrl.searchParams.set('generator', 'search');
      apiUrl.searchParams.set('gsrnamespace', '6');
      apiUrl.searchParams.set('gsrsearch', `${q} filetype:bitmap`);
      apiUrl.searchParams.set('gsrlimit', '24');
      apiUrl.searchParams.set('prop', 'imageinfo');
      apiUrl.searchParams.set('iiprop', 'url|size|extmetadata|mime');
      apiUrl.searchParams.set('iiurlwidth', '1600');
      apiUrl.searchParams.set('format', 'json');

      const res = await fetch(apiUrl.toString(), {
        signal: AbortSignal.timeout(8000),
        headers: { 'User-Agent': 'OlhaPautaCMS/1.0 (+https://olhapauta.com.br)' },
      });
      if (!res.ok) throw new Error(`Wikimedia HTTP ${res.status}`);
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
                };
              }[];
            }
          >;
        };
      };

      const pages = Object.values(data.query?.pages || {});
      return pages
        .map((p) => {
          const info = p.imageinfo?.[0];
          if (!info?.url || !info.width || !info.height) return null;
          if (info.mime && !['image/jpeg', 'image/png', 'image/webp'].includes(info.mime)) return null;
          const ratio = info.width / info.height;
          if (info.width < 1200 || ratio < 1.2 || ratio > 2.4) return null;

          const license = stripTags(info.extmetadata?.LicenseShortName?.value || '');
          if (!isCommercialFreeLicense(license)) return null;

          const artist = stripTags(info.extmetadata?.Artist?.value || 'Wikimedia Commons').slice(0, 60);
          const cleanFileTitle = (p.title || '').replace(/^File:/i, '').replace(/\.[^.]+$/, '');
          const suggestedAlt = titulo ? `Imagem ilustrativa da pauta: ${titulo}` : cleanFileTitle;

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
    };

    let usedQuery = queries[0];
    let results: unknown[] = [];
    for (const q of queries) {
      usedQuery = q;
      results = await searchWikimedia(q);
      if (results.length >= 3) break;
    }

    return new Response(JSON.stringify({ ok: true, query: usedQuery, results }), {
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
