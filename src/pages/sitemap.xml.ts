import type { APIRoute } from 'astro';
import { TRILHAS } from '../data/pautas';
import { fetchPublishedPautas } from '../lib/supabase';

const escapeXml = (str: string) =>
  str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

export const GET: APIRoute = async () => {
  const pautas = await fetchPublishedPautas();
  const base = 'https://olhapauta.com.br';

  const activeTrilhas = new Set(pautas.map((p) => p.trilha));

  const staticUrls = [
    { loc: `${base}/`, priority: '1.0', changefreq: 'daily' },
    ...TRILHAS.filter((t) => activeTrilhas.has(t.slug)).map((t) => ({
      loc: `${base}/pautas/${t.slug}`,
      priority: '0.8',
      changefreq: 'daily',
    })),
    { loc: `${base}/sobre`, priority: '0.5', changefreq: 'monthly' },
    { loc: `${base}/politica-editorial`, priority: '0.5', changefreq: 'monthly' },
    { loc: `${base}/politica-de-privacidade`, priority: '0.4', changefreq: 'monthly' },
    { loc: `${base}/contato`, priority: '0.4', changefreq: 'monthly' },
  ];

  const pautaUrls = pautas.map((p) => ({
    loc: `${base}/pauta/${p.slug}`,
    lastmod: new Date(p.dataISO).toISOString(),
    priority: '0.9',
    changefreq: 'weekly',
    image: p.imagem?.url
      ? {
          loc: p.imagem.url,
          title: p.titulo,
          caption: p.imagem.alt || p.titulo,
        }
      : undefined,
  }));

  const entries = [...staticUrls, ...pautaUrls]
    .map((u) => {
      const lastmodXml = 'lastmod' in u && u.lastmod ? `\n    <lastmod>${u.lastmod}</lastmod>` : '';
      const imageXml =
        'image' in u && u.image
          ? `\n    <image:image>\n      <image:loc>${escapeXml(u.image.loc)}</image:loc>\n      <image:title>${escapeXml(u.image.title)}</image:title>\n      <image:caption>${escapeXml(u.image.caption)}</image:caption>\n    </image:image>`
          : '';
      return `  <url>
    <loc>${u.loc}</loc>${lastmodXml}
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>${imageXml}
  </url>`;
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${entries}
</urlset>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=300, s-maxage=1800',
    },
  });
};
