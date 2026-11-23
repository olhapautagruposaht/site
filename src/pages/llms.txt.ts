import type { APIRoute } from 'astro';
import { TRILHAS } from '../data/pautas';
import { fetchPublishedPautas } from '../lib/supabase';

export const GET: APIRoute = async () => {
  const pautas = await fetchPublishedPautas();
  const lines = [
    '# OlhaPauta',
    '',
    '> Publicação editorial brasileira especializada em Inteligência Artificial, Tecnologia, Segurança, Negócios e Guias práticos.',
    '',
    '## Trilhas Editoriais',
    ...TRILHAS.map((t) => `- **${t.nome}** (https://olhapauta.com.br/trilha/${t.slug}): ${t.descricao}`),
    '',
    '## Pautas Recentes',
    ...pautas.map(
      (p) =>
        `- [Pauta Nº ${p.numero}: ${p.titulo}](https://olhapauta.com.br/pauta/${p.slug}): ${p.resumoCurto}`
    ),
    '',
    '## Sobre',
    '- Site: https://olhapauta.com.br',
    '- Idioma: pt-BR',
    '- RSS: https://olhapauta.com.br/rss.xml',
    '',
  ];

  return new Response(lines.join('\n'), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=300, s-maxage=1800',
    },
  });
};
