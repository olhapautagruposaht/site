import type { APIRoute } from 'astro';
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
  const items = pautas
    .map((p) => {
      const url = `https://olhapauta.com.br/pauta/${p.slug}`;
      const pubDate = new Date(p.dataISO).toUTCString();
      return `    <item>
      <title>${escapeXml(p.titulo)}</title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <description>${escapeXml(p.subtitulo)}</description>
      <category>${escapeXml(p.trilhaLabel)}</category>
      <pubDate>${pubDate}</pubDate>
      <enclosure url="${escapeXml(p.imagem.url)}" type="image/jpeg" length="0" />
    </item>`;
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>OlhaPauta</title>
    <link>https://olhapauta.com.br</link>
    <description>Publicação editorial sobre Inteligência Artificial, Tecnologia, Segurança, Negócios e Guias práticos.</description>
    <language>pt-BR</language>
    <atom:link href="https://olhapauta.com.br/rss.xml" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=300, s-maxage=1800',
    },
  });
};
