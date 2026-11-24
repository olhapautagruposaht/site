import type { PautaSection, PautaFaq, TrilhaSlug } from '../data/pautas';

export interface PautaPayload {
  id?: string;
  slug?: string;
  trilha: TrilhaSlug;
  trilha_label?: string;
  status?: 'draft' | 'review' | 'published' | 'archived';
  destaque?: boolean;
  titulo: string;
  subtitulo: string;
  resumo_curto: string;
  tldr: string[];
  conteudo: PautaSection[];
  faqs?: PautaFaq[];
  tags?: string[];
  tempo_leitura?: string;
  autor_nome?: string;
  autor_cargo?: string;
  imagem_url: string;
  imagem_alt: string;
  imagem_credito?: string;
  video_url?: string | null;
  source_urls?: string[];
}

export interface QualityCheckItem {
  id: string;
  label: string;
  status: 'pass' | 'warn' | 'fail';
  detail: string;
}

export interface QualityReport {
  score: number;
  wordCount: number;
  estimatedReadTime: string;
  checks: QualityCheckItem[];
  blockers: string[];
}

const AI_CLICHES = [
  'no cenário atual',
  'é importante ressaltar',
  'vale ressaltar',
  'vale destacar',
  'em suma',
  'mergulhar fundo',
  'revolucionário',
  'divisor de águas',
  'neste artigo vamos',
  'em um mundo cada vez mais',
];

export const TRILHA_LABELS: Record<TrilhaSlug, string> = {
  ia: 'IA',
  tecnologia: 'Tecnologia',
  seguranca: 'Segurança',
  negocios: 'Negócios',
  guias: 'Guias',
};

export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96);
}

export function extractAllText(p: Partial<PautaPayload>): string {
  const parts: string[] = [
    p.titulo || '',
    p.subtitulo || '',
    p.resumo_curto || '',
    ...(p.tldr || []),
  ];

  for (const sec of p.conteudo || []) {
    if (sec.heading) parts.push(sec.heading);
    parts.push(...(sec.paragraphs || []));
    if (sec.quote) parts.push(sec.quote);
    if (sec.callout?.text) parts.push(sec.callout.text);
    parts.push(...(sec.bullets || []));
    for (const sub of sec.subsections || []) {
      if (sub.heading) parts.push(sub.heading);
      parts.push(...(sub.paragraphs || []));
    }
  }

  for (const faq of p.faqs || []) {
    parts.push(faq.pergunta || '', faq.resposta || '');
  }

  return parts.join(' ').trim();
}

export function evaluatePautaQuality(p: Partial<PautaPayload>): QualityReport {
  const fullText = extractAllText(p);
  const words = fullText ? fullText.split(/\s+/).filter(Boolean).length : 0;
  const estimatedReadTime = `${Math.max(2, Math.ceil(words / 220))} MIN`;

  const checks: QualityCheckItem[] = [];
  const blockers: string[] = [];

  // 1. Travessões (Regra anti-IA obrigatória)
  const hasDashes = /[—–]/.test(fullText);
  checks.push({
    id: 'no-dashes',
    label: 'Zero travessões (— / –)',
    status: hasDashes ? 'fail' : 'pass',
    detail: hasDashes ? 'Remova travessões (use vírgula, dois-pontos ou ponto final).' : 'Limpo.',
  });
  if (hasDashes) blockers.push('O texto contém travessões (— ou –), proibidos pela regra editorial.');

  // 2. Clichês de IA
  const lowerText = fullText.toLowerCase();
  const foundCliches = AI_CLICHES.filter((c) => lowerText.includes(c));
  checks.push({
    id: 'no-cliches',
    label: 'Linguagem humana (sem clichês de IA)',
    status: foundCliches.length === 0 ? 'pass' : 'warn',
    detail:
      foundCliches.length === 0
        ? 'Nenhum clichê detectado.'
        : `Clichês detectados: ${foundCliches.join(', ')}.`,
  });

  // 3. Título (H1 único + Discover)
  const titleLen = (p.titulo || '').trim().length;
  checks.push({
    id: 'title',
    label: 'Título (H1 único · 45–85 chars)',
    status: titleLen >= 40 && titleLen <= 105 ? 'pass' : titleLen >= 15 ? 'warn' : 'fail',
    detail: `${titleLen} caracteres.`,
  });
  if (titleLen < 15) blockers.push('Título muito curto ou vazio.');

  // 4. Subtítulo / Meta description
  const subLen = (p.subtitulo || '').trim().length;
  checks.push({
    id: 'subtitle',
    label: 'Subtítulo / Meta Description',
    status: subLen >= 90 && subLen <= 220 ? 'pass' : subLen >= 40 ? 'warn' : 'fail',
    detail: `${subLen} caracteres.`,
  });
  if (subLen < 30) blockers.push('Subtítulo obrigatório.');

  // 5. Capa 16:9 + Alt (Google Discover)
  const hasImage = Boolean((p.imagem_url || '').trim());
  const hasAlt = (p.imagem_alt || '').trim().length >= 15;
  checks.push({
    id: 'cover',
    label: 'Capa 16:9 + texto Alt (Discover)',
    status: hasImage && hasAlt ? 'pass' : hasImage ? 'warn' : 'fail',
    detail: !hasImage
      ? 'Envie uma imagem 16:9 (>= 1200px).'
      : hasAlt
        ? 'Imagem e Alt preenchidos.'
        : 'Preencha um texto Alt descritivo (>= 15 caracteres).',
  });
  if (!hasImage) blockers.push('Imagem de capa 16:9 é obrigatória.');

  // 6. Profundidade & Seções H2 (Anti thin-content + AdSense)
  const h2Count = (p.conteudo || []).filter((s) => (s.heading || '').trim().length > 0).length;
  checks.push({
    id: 'depth',
    label: 'Profundidade (800+ palavras · 4+ H2)',
    status: words >= 750 && h2Count >= 4 ? 'pass' : words >= 400 && h2Count >= 2 ? 'warn' : 'fail',
    detail: `${words} palavras · ${h2Count} seções H2.`,
  });
  if (words < 250 || h2Count < 1) {
    blockers.push('Conteúdo muito curto (mínimo 250 palavras e 1 seção H2 para publicar).');
  }

  // 7. Bloco "O que você precisa saber" (AIO / GEO)
  const tldrCount = (p.tldr || []).filter((t) => t.trim().length > 10).length;
  checks.push({
    id: 'tldr',
    label: 'O que você precisa saber (3 pontos)',
    status: tldrCount >= 3 ? 'pass' : tldrCount >= 1 ? 'warn' : 'fail',
    detail: `${tldrCount} de 3 pontos preenchidos.`,
  });

  // 8. FAQs (FAQPage JSON-LD para Search & GEO)
  const faqCount = (p.faqs || []).filter((f) => f.pergunta?.trim() && f.resposta?.trim()).length;
  checks.push({
    id: 'faqs',
    label: 'Perguntas Frequentes (FAQPage JSON-LD)',
    status: faqCount >= 3 ? 'pass' : faqCount >= 1 ? 'warn' : 'warn',
    detail: `${faqCount} perguntas cadastradas (recomendado: 3–4).`,
  });

  const passed = checks.filter((c) => c.status === 'pass').length;
  const warned = checks.filter((c) => c.status === 'warn').length;
  const score = Math.round(((passed + warned * 0.5) / checks.length) * 100);

  return {
    score,
    wordCount: words,
    estimatedReadTime,
    checks,
    blockers,
  };
}
