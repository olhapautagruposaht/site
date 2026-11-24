import type { PautaPayload } from './editorial-validator';
import type { TrilhaSlug } from '../data/pautas';

export type AiProvider = 'openai' | 'gemini' | 'anthropic' | 'grok' | 'openrouter' | 'custom';

export interface AiSettings {
  ai_provider: AiProvider;
  ai_model: string;
  ai_api_key: string;
  ai_base_url?: string | null;
}

const PROVIDER_ENDPOINTS: Record<Exclude<AiProvider, 'custom' | 'anthropic'>, string> = {
  openai: 'https://api.openai.com/v1/chat/completions',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
  grok: 'https://api.x.ai/v1/chat/completions',
  openrouter: 'https://openrouter.ai/api/v1/chat/completions',
};

const SYSTEM_PROMPT = `Você é o editor-chefe do OlhaPauta (olhapauta.com.br), publicação editorial brasileira de alto padrão sobre Inteligência Artificial, Tecnologia, Segurança, Negócios e Guias práticos.

REGRAS OBRIGATÓRIAS (NUNCA VIOLE):
1. Idioma: Português do Brasil (pt-BR), tom humano, direto, analítico e jornalístico.
2. PROIBIDO usar travessão (— ou –) em qualquer lugar do JSON. Use vírgula, dois-pontos ou ponto final.
3. PROIBIDO usar clichês de IA ("no cenário atual", "é importante ressaltar", "em suma", "mergulhar fundo", "revolucionário", "divisor de águas", emojis).
4. Estrutura para Google Discover, Google Search, AIO (AI Overviews) e GEO (ChatGPT/Perplexity):
   - Título (H1): 55 a 85 caracteres, forte, humano, sem clickbait enganoso.
   - Subtítulo: 120 a 190 caracteres respondendo o valor da pauta.
   - Resumo curto: 1 a 2 frases claras para cards.
   - TL;DR ("O que você precisa saber"): exatamente 3 pontos objetivos.
   - Conteúdo: 4 a 5 seções com H2 claro, 2 a 3 parágrafos bem escritos por seção (mínimo 900 palavras no total). Use "subsections" (H3) quando ajudar na escaneabilidade, "quote" em 1 seção, "callout" em 1 seção e "bullets" em 1 seção.
   - FAQs: exatamente 4 perguntas reais que leitores buscariam no Google, com respostas diretas de 2 a 3 frases.
   - Tags: 4 tags curtas em CAIXA ALTA.
   - Sugestão de prompt de imagem 16:9 (campo "imagem_alt" descritivo em pt-BR).

RETORNE APENAS UM OBJETO JSON VÁLIDO (sem markdown, sem \`\`\`json) neste formato exato:
{
  "titulo": "string",
  "subtitulo": "string",
  "resumo_curto": "string",
  "tldr": ["ponto 1", "ponto 2", "ponto 3"],
  "conteudo": [
    {
      "heading": "Título H2 da seção",
      "paragraphs": ["parágrafo 1", "parágrafo 2"],
      "subsections": [{ "heading": "Subtítulo H3 opcional", "paragraphs": ["texto"] }],
      "quote": "citação opcional",
      "callout": { "label": "Contexto", "text": "destaque opcional" },
      "bullets": ["item opcional"]
    }
  ],
  "faqs": [
    { "pergunta": "string", "resposta": "string" }
  ],
  "tags": ["IA", "TAG2", "TAG3", "TAG4"],
  "imagem_alt": "Descrição acessível da imagem de capa 16:9"
}`;

async function callProvider(
  settings: AiSettings,
  userPrompt: string,
  maxTokens = 4096
): Promise<string> {
  if (!settings.ai_api_key) {
    throw new Error('Chave de API não configurada em Configurações → IA.');
  }

  if (settings.ai_provider === 'anthropic') {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': settings.ai_api_key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: settings.ai_model || 'claude-sonnet-4-20250514',
        max_tokens: maxTokens,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Anthropic HTTP ${res.status}: ${errText.slice(0, 240)}`);
    }

    const data = (await res.json()) as { content?: { type: string; text?: string }[] };
    return data.content?.find((c) => c.type === 'text')?.text || '';
  }

  const endpoint =
    settings.ai_provider === 'custom'
      ? `${(settings.ai_base_url || '').replace(/\/+$/, '')}/chat/completions`
      : PROVIDER_ENDPOINTS[settings.ai_provider];

  if (!endpoint || endpoint === '/chat/completions') {
    throw new Error('URL base do provedor customizado não informada.');
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${settings.ai_api_key}`,
  };
  if (settings.ai_provider === 'openrouter') {
    headers['HTTP-Referer'] = 'https://olhapauta.com.br';
    headers['X-Title'] = 'OlhaPauta CMS';
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: settings.ai_model,
      temperature: 0.7,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Provedor ${settings.ai_provider} HTTP ${res.status}: ${errText.slice(0, 240)}`);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return data.choices?.[0]?.message?.content || '';
}

export async function testAiConnection(settings: AiSettings): Promise<{ ok: boolean; reply?: string; error?: string }> {
  try {
    const raw = await callProvider(
      settings,
      'Responda apenas com este JSON: {"ok": true, "msg": "Conexão validada"}',
      80
    );
    return { ok: true, reply: raw.slice(0, 120) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function generatePautaDraft(
  settings: AiSettings,
  input: { topic: string; trilha: TrilhaSlug; foco: 'discover' | 'search'; sourceUrls?: string[] }
): Promise<Partial<PautaPayload>> {
  const focoInstrucao =
    input.foco === 'discover'
      ? 'Foco GOOGLE DISCOVER: ângulo humano, impacto concreto no dia a dia no Brasil, título que desperta curiosidade genuína sem clickbait enganoso.'
      : 'Foco GOOGLE SEARCH + AIO/GEO: guia prático aprofundado, resposta direta logo no primeiro parágrafo, passo a passo e comparativo objetivo.';

  const fontes =
    input.sourceUrls && input.sourceUrls.length > 0
      ? `\nFontes de referência informadas pelo editor:\n${input.sourceUrls.join('\n')}`
      : '';

  const userPrompt = `Escreva uma pauta completa para a editoria "${input.trilha.toUpperCase()}".
Tema / pauta solicitada: ${input.topic}
${focoInstrucao}${fontes}

Lembre-se: ZERO travessões (— ou –), texto profundo com 900+ palavras, 4 a 5 seções H2, e retorne APENAS JSON puro.`;

  const raw = await callProvider(settings, userPrompt, 4500);
  const cleaned = raw
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/, '')
    .replace(/[—–]/g, ', ');

  const parsed = JSON.parse(cleaned) as Partial<PautaPayload>;
  return {
    ...parsed,
    trilha: input.trilha,
    source_urls: input.sourceUrls || [],
  };
}
