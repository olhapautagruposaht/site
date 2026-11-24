import type { APIRoute } from 'astro';
import { TRILHAS } from '../data/pautas';
import { fetchPublishedPautas } from '../lib/supabase';

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
  }));

  const entries = [...staticUrls, ...pautaUrls]
    .map(
      (u) => `  <url>
    <loc>${u.loc}</loc>${'lastmod' in u && u.lastmod ? `\n    <lastmod>${u.lastmod}</lastmod>` : ''}
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`
    )
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</urlset>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=300, s-maxage=1800',
    },
  });
};
