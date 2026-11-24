import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { PAUTAS, type Pauta, type TrilhaSlug } from '../data/pautas';

const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

export const supabase: SupabaseClient | null =
  supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

interface PautaRow {
  numero: number;
  slug: string;
  trilha: TrilhaSlug;
  trilha_label: string;
  titulo: string;
  subtitulo: string;
  resumo_curto: string;
  tldr: string[];
  published_at: string | null;
  created_at: string;
  tempo_leitura: string;
  autor_nome: string;
  autor_cargo: string;
  imagem_url: string;
  imagem_alt: string;
  imagem_credito: string;
  video_url?: string | null;
  source_urls?: string[];
  tags: string[];
  destaque: boolean;
  conteudo: Pauta['conteudo'];
  faqs?: Pauta['faqs'];
}

function mapRowToPauta(row: PautaRow): Pauta {
  const iso = row.published_at ?? row.created_at;
  const formattedShort = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
    .format(new Date(iso))
    .replace(/\./g, '')
    .toUpperCase();

  return {
    numero: String(row.numero).padStart(3, '0'),
    slug: row.slug,
    trilha: row.trilha,
    trilhaLabel: row.trilha_label,
    titulo: row.titulo,
    subtitulo: row.subtitulo,
    resumoCurto: row.resumo_curto,
    tldr: Array.isArray(row.tldr) ? row.tldr : [],
    dataPublicacao: formattedShort,
    dataISO: iso,
    tempoLeitura: row.tempo_leitura,
    autor: {
      nome: row.autor_nome || 'Jonathas Costa',
      cargo: row.autor_cargo || 'Fundador & Editor',
    },
    imagem: {
      url: row.imagem_url,
      alt: row.imagem_alt,
      credito: row.imagem_credito,
    },
    videoUrl: row.video_url || undefined,
    sourceUrls: Array.isArray(row.source_urls) ? row.source_urls : undefined,
    tags: Array.isArray(row.tags) ? row.tags : [],
    destaque: row.destaque,
    conteudo: Array.isArray(row.conteudo) ? row.conteudo : [],
    faqs: Array.isArray(row.faqs) ? row.faqs : undefined,
  };
}

export async function fetchPublishedPautas(): Promise<Pauta[]> {
  if (!supabase) return PAUTAS;

  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('pautas')
    .select('*')
    .eq('status', 'published')
    .lte('published_at', nowIso)
    .order('published_at', { ascending: false });

  if (error || !data || data.length === 0) {
    return PAUTAS;
  }

  return (data as PautaRow[]).map(mapRowToPauta);
}

export async function fetchPautasByTrilha(trilha: TrilhaSlug): Promise<Pauta[]> {
  const all = await fetchPublishedPautas();
  return all.filter((p) => p.trilha === trilha);
}
