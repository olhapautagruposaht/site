import { env as cfEnv } from 'cloudflare:workers';
import type { PautaPayload } from './editorial-validator';
import type { TrilhaSlug } from '../data/pautas';
import {
  assertSafeExternalUrl,
  detectImageMimeFromMagicBytes,
  readResponseBytesWithLimit,
} from './security';

export type AiProvider = 'openai' | 'gemini' | 'anthropic' | 'grok' | 'deepseek' | 'openrouter' | 'opencode' | 'opencode_go' | 'custom';
export type ImageProvider = 'auto' | 'cloudflare' | 'huggingface' | 'fal' | 'gemini' | 'openai';

export interface AiSettings {
  ai_provider: AiProvider;
  ai_model: string;
  ai_api_key: string;
  provider_keys?: Record<string, string> | null;
  ai_base_url?: string | null;
  search_api_key?: string | null;
  image_provider?: ImageProvider | null;
  image_model?: string | null;
  image_api_key?: string | null;
}

export function resolveProviderApiKey(
  settings: Partial<AiSettings> | null | undefined,
  provider?: string
): string {
  const p = provider || settings?.ai_provider || 'gemini';
  const vault = settings?.provider_keys || {};
  if (typeof vault[p] === 'string' && vault[p].trim()) {
    return vault[p].trim();
  }
  if (settings?.ai_provider === p && settings?.ai_api_key?.trim()) {
    return settings.ai_api_key.trim();
  }
  return '';
}

const PROVIDER_ENDPOINTS: Record<Exclude<AiProvider, 'custom' | 'anthropic'>, string> = {
  openai: 'https://api.openai.com/v1/chat/completions',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
  grok: 'https://api.x.ai/v1/chat/completions',
  deepseek: 'https://api.deepseek.com/v1/chat/completions',
  openrouter: 'https://openrouter.ai/api/v1/chat/completions',
  opencode: 'https://opencode.ai/zen/v1/chat/completions',
  opencode_go: 'https://opencode.ai/zen/go/v1/chat/completions',
};

const SYSTEM_PROMPT = `Você é o editor-chefe do OlhaPauta (olhapauta.com.br), publicação editorial brasileira de alto padrão sobre Inteligência Artificial, Tecnologia, Segurança, Negócios e Guias práticos.

REGRAS OBRIGATÓRIAS (NUNCA VIOLE):
1. Idioma: Português do Brasil (pt-BR), tom humano, direto, analítico e jornalístico.
2. PROIBIDO usar travessão (— ou –) em qualquer lugar do JSON. Use vírgula, dois-pontos ou ponto final.
3. PROIBIDO usar clichês de IA ("no cenário atual", "é importante ressaltar", "em suma", "mergulhar fundo", "revolucionário", "divisor de águas", emojis).
4. Baseie-se estritamente em fatos reais e atualizados (use os dados pesquisados na web e fontes fornecidas). Nunca invente estatísticas ou citações falsas.
5. Auto-linkagem interna e externa (SEO, E-E-A-T e retenção):
   - Se forem fornecidas "PAUTAS JÁ PUBLICADAS NO OLHAPAUTA", insira naturalmente 1 a 2 links internos no meio dos parágrafos usando Markdown: [texto âncora natural](/pauta/slug-exato). NUNCA invente slugs que não estejam na lista.
   - Insira naturalmente 1 a 2 links externos reais no meio dos parágrafos usando Markdown: [Nome da Fonte](https://url-exata) usando APENAS URLs reais vindas da pesquisa web ou das fontes fornecidas. NUNCA invente URLs.
6. Estrutura para Google Discover, Google Search, AIO (AI Overviews) e GEO (ChatGPT/Perplexity):
   - Título (H1): 55 a 85 caracteres, provocativo, humano e com tensão real ou curiosidade genuína, 100% entregue no texto (sem clickbait enganoso e sem jargão corporativo obscuro).
   - Subtítulo: 120 a 190 caracteres respondendo o valor da pauta.
   - Resumo curto: 1 a 2 frases claras para cards.
   - TL;DR ("O que você precisa saber"): exatamente 3 pontos objetivos.
   - Conteúdo: 4 a 5 seções com H2 claro, 2 a 3 parágrafos bem escritos por seção (mínimo 900 palavras no total). Use "subsections" (H3) quando ajudar na escaneabilidade, "quote" em 1 seção, "callout" em 1 seção e "bullets" em 1 seção.
   - FAQs: exatamente 4 perguntas reais que leitores buscariam no Google, com respostas diretas de 2 a 3 frases.
   - Tags: 4 tags curtas em CAIXA ALTA.
   - imagem_alt: Descrição acessível em pt-BR da imagem de capa 16:9 ideal para esta pauta.

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

function stripHtmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 3500);
}

async function fetchReferenceSnippets(urls: string[]): Promise<string> {
  if (!urls.length) return '';
  const results = await Promise.all(
    urls.slice(0, 2).map(async (rawUrl) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      try {
        const safe = assertSafeExternalUrl(rawUrl);
        const res = await fetch(safe.toString(), {
          signal: controller.signal,
          redirect: 'error',
          headers: { 'User-Agent': 'OlhaPautaBot/1.0 (+https://olhapauta.com.br)' },
        });
        if (res.ok) {
          const bytes = await readResponseBytesWithLimit(res, 256 * 1024);
          const text = stripHtmlToText(new TextDecoder().decode(bytes));
          if (text.length > 100) {
            return `FONTE (${safe.toString()}):\n${text}`;
          }
        }
      } catch {
        // Ignore unreachable or blocked reference URLs
      } finally {
        clearTimeout(timeout);
      }
      return '';
    })
  );
  return results.filter(Boolean).join('\n\n');
}

async function searchWithTavily(
  apiKey: string,
  query: string,
  maxResults = 5,
  snippetChars = 800
): Promise<{ context: string; urls: string[] }> {
  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      signal: AbortSignal.timeout(10000),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: 'basic',
        max_results: maxResults,
        include_answer: true,
      }),
    });
    if (!res.ok) return { context: '', urls: [] };
    const data = (await res.json()) as {
      answer?: string;
      results?: { title?: string; url?: string; content?: string }[];
    };
    const urls = (data.results || []).map((r) => r.url).filter((u): u is string => Boolean(u));
    const lines = [
      data.answer ? `RESUMO: ${data.answer.slice(0, 400)}` : '',
      ...(data.results || []).map(
        (r, i) => `[${i + 1}] ${r.title || ''} (${r.url || ''})\n${(r.content || '').slice(0, snippetChars)}`
      ),
    ].filter(Boolean);
    return { context: lines.join('\n\n'), urls };
  } catch {
    return { context: '', urls: [] };
  }
}

async function callGeminiWithSearch(
  settings: AiSettings,
  userPrompt: string,
  maxTokens = 4500
): Promise<{ text: string; groundingUrls: string[] }> {
  const model = settings.ai_model || 'gemini-3.8-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  const res = await fetch(url, {
    method: 'POST',
    signal: AbortSignal.timeout(45000),
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': settings.ai_api_key,
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      tools: [{ google_search: {} }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: maxTokens,
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini Search HTTP ${res.status}: ${errText.slice(0, 260)}`);
  }

  const data = (await res.json()) as {
    candidates?: {
      content?: { parts?: { text?: string }[] };
      groundingMetadata?: {
        groundingChunks?: { web?: { uri?: string; title?: string } }[];
      };
    }[];
  };

  const candidate = data.candidates?.[0];
  const text = (candidate?.content?.parts || []).map((p) => p.text || '').join('\n').trim();
  const groundingUrls = (candidate?.groundingMetadata?.groundingChunks || [])
    .map((c) => c.web?.uri)
    .filter((u): u is string => Boolean(u) && u.startsWith('http'));

  return { text, groundingUrls: Array.from(new Set(groundingUrls)).slice(0, 5) };
}

async function callProvider(
  settings: AiSettings,
  userPrompt: string,
  maxTokens = 4500,
  signal?: AbortSignal,
  jsonMode = false,
  customSystemPrompt?: string
): Promise<string> {
  if (!settings.ai_api_key) {
    throw new Error('Chave de API não configurada em Minha IA (API).');
  }

  const reqSignal = signal || AbortSignal.timeout(90000);
  const sysPrompt = customSystemPrompt || SYSTEM_PROMPT;

  if (settings.ai_provider === 'anthropic') {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: reqSignal,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': settings.ai_api_key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: settings.ai_model || 'claude-sonnet-5-5',
        max_tokens: maxTokens,
        system: sysPrompt,
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

  let endpoint = '';
  if (settings.ai_provider === 'custom') {
    if (!settings.ai_base_url) throw new Error('URL base do provedor customizado não informada.');
    const safeBase = assertSafeExternalUrl(settings.ai_base_url, { allowHttpInDev: true });
    endpoint = `${safeBase.toString().replace(/\/+$/, '')}/chat/completions`;
  } else {
    endpoint = PROVIDER_ENDPOINTS[settings.ai_provider];
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${settings.ai_api_key}`,
  };
  if (settings.ai_provider === 'openrouter') {
    headers['HTTP-Referer'] = 'https://olhapauta.com.br';
    headers['X-Title'] = 'OlhaPauta CMS';
  }
  if (settings.ai_provider === 'opencode_go' || settings.ai_provider === 'opencode') {
    headers['x-opencode-session'] = `olhapauta-${crypto.randomUUID()}`;
    headers['x-opencode-client'] = 'olhapauta-cms';
  }

  const payload: Record<string, unknown> = {
    model: settings.ai_model,
    temperature: 0.7,
    max_tokens: maxTokens,
    messages: [
      { role: 'system', content: sysPrompt },
      { role: 'user', content: userPrompt },
    ],
  };
  if (jsonMode && settings.ai_provider !== 'custom') {
    payload.response_format = { type: 'json_object' };
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    signal: reqSignal,
    headers,
    body: JSON.stringify(payload),
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

function extractJsonObject(raw: string): string {
  const trimmed = raw
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/, '');
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first !== -1 && last > first) {
    return trimmed.slice(first, last + 1);
  }
  return trimmed;
}

function parseAiJson<T>(raw: string): T {
  if (!raw || !raw.trim()) {
    throw new Error('O modelo retornou uma resposta vazia. Tente clicar novamente ou trocar de modelo em Minha IA.');
  }
  const cleaned = extractJsonObject(raw)
    .replace(/[—–]/g, ', ')
    .replace(/,\s*([}\]])/g, '$1');
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    try {
      const sanitized = cleaned.replace(/[\u0000-\u001F]+/g, ' ');
      return JSON.parse(sanitized) as T;
    } catch (e) {
      throw new Error(
        `O modelo não retornou JSON completo (${e instanceof Error ? e.message : 'erro de sintaxe'}). Tente novamente.`
      );
    }
  }
}

export async function testAiConnection(
  settings: AiSettings
): Promise<{ ok: boolean; reply?: string; error?: string }> {
  if (!settings.ai_api_key) {
    return { ok: false, error: 'Chave de API não informada.' };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    if (settings.ai_provider === 'gemini') {
      const model = settings.ai_model || 'gemini-3.8-flash';
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
      const res = await fetch(url, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': settings.ai_api_key,
        },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: 'Responda apenas: OK' }] }],
          generationConfig: { maxOutputTokens: 32, temperature: 0 },
        }),
      });
      if (!res.ok) {
        const errText = await res.text();
        return { ok: false, error: `Gemini HTTP ${res.status}: ${errText.slice(0, 220)}` };
      }
      const data = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      const reply = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join(' ').trim();
      return { ok: true, reply: reply || 'OK (conectado)' };
    }

    const raw = await callProvider(settings, 'Responda apenas: OK', 64, controller.signal);
    return { ok: true, reply: raw.slice(0, 120) || 'OK (conectado)' };
  } catch (err) {
    const msg =
      err instanceof Error && err.name === 'AbortError'
        ? 'Tempo limite (15s) atingido. Tente novamente ou escolha um modelo mais rápido (ex: flash).'
        : err instanceof Error
          ? err.message
          : String(err);
    return { ok: false, error: msg };
  } finally {
    clearTimeout(timeout);
  }
}

export interface TrendingSuggestion {
  trilha: TrilhaSlug;
  foco: 'discover' | 'search';
  titulo: string;
  angulo: string;
  motivo: string;
  source_urls?: string[];
}

export async function discoverTrendingTopics(
  settings: AiSettings,
  trilhaFilter: TrilhaSlug | 'all' = 'all'
): Promise<{ suggestions: TrendingSuggestion[]; webSearchUsed: string }> {
  const today = new Date().toISOString().slice(0, 10);
  const trilhaHint =
    trilhaFilter === 'all'
      ? 'Misture as 5 editorias oficiais: ia, tecnologia, seguranca, negocios e guias.'
      : `Foque exclusivamente na editoria "${trilhaFilter}".`;

  let tavilyContext = '';
  let webSearchUsed = 'none';
  if (settings.search_api_key && settings.ai_provider !== 'gemini') {
    // 3 parallel compact broad-appeal searches so the 5 cards cover high-volume Discover + high-RPM Search
    const [q1, q2, q3] = await Promise.all([
      searchWithTavily(
        settings.search_api_key,
        `novidades inteligência artificial ChatGPT Gemini Claude OpenAI Apple Google ${today} Brasil`,
        3,
        320
      ),
      searchWithTavily(
        settings.search_api_key,
        `WhatsApp Android iPhone golpe IA deepfake celular Brasil novidade ${today}`,
        3,
        320
      ),
      searchWithTavily(
        settings.search_api_key,
        `ferramentas IA gratuitas produtividade trabalho negócios tecnologia Brasil ${today}`,
        3,
        320
      ),
    ]);
    tavilyContext = [q1.context, q2.context, q3.context].filter(Boolean).join('\n\n---\n\n');
    if (tavilyContext) webSearchUsed = 'tavily-multi';
  }

  const prompt = `Data de hoje: ${today}.
Você é o editor de crescimento e Google Discover do OlhaPauta (olhapauta.com.br). Pesquise o que está EM ALTA HOJE com potencial REAL de explodir em cliques no Google Discover e Google Search no Brasil.
${trilhaHint}
${tavilyContext ? `\nNOTÍCIAS E TENDÊNCIAS DE HOJE:\n${tavilyContext}\n` : ''}
REGRAS PARA AS 5 PAUTAS (OBRIGATÓRIO):
- Distribua 1 pauta por editoria (ia, tecnologia, seguranca, negocios, guias), misturando 3 com foco "discover" e 2 com foco "search".
- PROIBIDO jargão corporativo obscuro no título (nada de "SOC", "CISO", "SIEM"). Escreva para milhões de brasileiros conectados que usam celular, WhatsApp, trabalho digital e ferramentas de IA.
- Títulos PROVOCATIVOS, com curiosidade real, impacto no bolso, na privacidade ou na rotina — 100% honestos e dentro das políticas do Google Discover (nunca clickbait mentiroso, nunca travessão — ou –).

RETORNE APENAS UM JSON VÁLIDO (sem markdown) neste formato exato:
{
  "suggestions": [
    {
      "trilha": "ia | tecnologia | seguranca | negocios | guias",
      "foco": "discover | search",
      "titulo": "Título provocativo e claro de 55 a 82 caracteres sem travessão",
      "angulo": "Resumo em 1 frase do ângulo concreto que a matéria vai abordar",
      "motivo": "Por que isso vai explodir em cliques no Discover ou ranquear no Search",
      "source_urls": ["https://..."]
    }
  ]
}`;

  let raw = '';
  let groundingUrls: string[] = [];
  const discoverSysPrompt =
    'Você é o editor de Google Discover do OlhaPauta (pt-BR). Retorne APENAS um objeto JSON válido com a chave "suggestions" contendo 5 objetos. Proibido markdown, proibido travessão (— ou –).';

  if (settings.ai_provider === 'gemini') {
    const gem = await callGeminiWithSearch(settings, prompt, 3500);
    raw = gem.text;
    groundingUrls = gem.groundingUrls;
    webSearchUsed = 'gemini-google-search';
  } else {
    raw = await callProvider(settings, prompt, 3500, undefined, true, discoverSysPrompt);
  }

  const parsed = parseAiJson<{ suggestions?: TrendingSuggestion[] }>(raw);
  const filterSafeUrls = (list: unknown[]): string[] =>
    list
      .filter((u): u is string => typeof u === 'string')
      .map((u) => {
        try {
          const parsed = assertSafeExternalUrl(u);
          if (parsed.username || parsed.password) return '';
          return parsed.toString();
        } catch {
          return '';
        }
      })
      .filter(Boolean);

  const suggestions = (parsed.suggestions || []).slice(0, 5).map((s) => ({
    trilha: (['ia', 'tecnologia', 'seguranca', 'negocios', 'guias'].includes(s.trilha)
      ? s.trilha
      : 'ia') as TrilhaSlug,
    foco: (s.foco === 'search' ? 'search' : 'discover') as 'discover' | 'search',
    titulo: (s.titulo || '').trim(),
    angulo: (s.angulo || '').trim(),
    motivo: (s.motivo || '').trim(),
    source_urls:
      Array.isArray(s.source_urls) && s.source_urls.length > 0
        ? filterSafeUrls(s.source_urls)
        : filterSafeUrls(groundingUrls).slice(0, 2),
  }));

  return { suggestions, webSearchUsed };
}

export async function generatePautaDraft(
  settings: AiSettings,
  input: {
    topic: string;
    trilha: TrilhaSlug;
    foco: 'discover' | 'search';
    sourceUrls?: string[];
    useWebSearch?: boolean;
    existingPautas?: { titulo: string; slug: string; trilha: string }[];
  }
): Promise<{ draft: Partial<PautaPayload>; webSearchUsed: string }> {
  const focoInstrucao =
    input.foco === 'discover'
      ? 'Foco GOOGLE DISCOVER: ângulo humano, impacto concreto no dia a dia no Brasil, título que desperta curiosidade genuína sem clickbait enganoso.'
      : 'Foco GOOGLE SEARCH + AIO/GEO: guia prático aprofundado, resposta direta logo no primeiro parágrafo, passo a passo e comparativo objetivo.';

  const userSources = input.sourceUrls || [];
  let tavilyContext = '';
  let discoveredUrls: string[] = [];
  let webSearchUsed = 'none';

  // Run reference URL fetches and Tavily web search in parallel (faster, avoids Worker timeouts)
  const [fetchedRefs, tvResult] = await Promise.all([
    fetchReferenceSnippets(userSources),
    input.useWebSearch && settings.search_api_key && settings.ai_provider !== 'gemini'
      ? searchWithTavily(settings.search_api_key, `${input.topic} inteligência artificial Brasil 2026`)
      : Promise.resolve({ context: '', urls: [] as string[] }),
  ]);

  if (tvResult.context) {
    tavilyContext = tvResult.context;
    discoveredUrls = tvResult.urls;
    webSearchUsed = 'tavily';
  }

  const internalLinksBlock =
    input.existingPautas && input.existingPautas.length > 0
      ? `PAUTAS JÁ PUBLICADAS NO OLHAPAUTA (use 1 a 2 em links internos Markdown [âncora](/pauta/slug) onde fizer sentido):\n${input.existingPautas
          .slice(0, 8)
          .map((ep) => `- ${ep.titulo} -> /pauta/${ep.slug} (${ep.trilha})`)
          .join('\n')}`
      : '';

  const contextBlocks = [
    tavilyContext ? `PESQUISA WEB EM TEMPO REAL:\n${tavilyContext}` : '',
    fetchedRefs ? `CONTEÚDO DOS LINKS DE REFERÊNCIA:\n${fetchedRefs}` : '',
    internalLinksBlock,
  ]
    .filter(Boolean)
    .join('\n\n');

  const today = new Date().toISOString().slice(0, 10);
  const userPrompt = `Data de hoje: ${today}.
Escreva uma pauta completa para a editoria "${input.trilha.toUpperCase()}".
Tema / pauta solicitada: ${input.topic}
${focoInstrucao}
${contextBlocks ? `\n${contextBlocks}\n` : ''}
Lembre-se: ZERO travessões (— ou –), texto profundo com 900+ palavras, 4 a 5 seções H2, e retorne APENAS JSON puro.`;

  let raw = '';
  if (input.useWebSearch && settings.ai_provider === 'gemini') {
    const gem = await callGeminiWithSearch(settings, userPrompt, 6500);
    raw = gem.text;
    discoveredUrls = [...discoveredUrls, ...gem.groundingUrls];
    webSearchUsed = 'gemini-google-search';
  } else {
    raw = await callProvider(settings, userPrompt, 6500, undefined, true);
    if (fetchedRefs && webSearchUsed === 'none') {
      webSearchUsed = 'reference-urls';
    }
  }

  const parsed = parseAiJson<Partial<PautaPayload>>(raw);
  const mergedSources = Array.from(new Set([...userSources, ...discoveredUrls]))
    .map((u) => {
      try {
        const safe = assertSafeExternalUrl(u);
        return safe.username || safe.password ? '' : safe.toString();
      } catch {
        return '';
      }
    })
    .filter(Boolean)
    .slice(0, 6);

  return {
    draft: {
      ...parsed,
      trilha: input.trilha,
      source_urls: mergedSources,
    },
    webSearchUsed,
  };
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function generateCoverImage(
  settings: AiSettings,
  input: { titulo: string; trilha: string; customPrompt?: string }
): Promise<{ bytes: Uint8Array; contentType: string; ext: string; providerUsed: string }> {
  const resolvedProvider: Exclude<ImageProvider, 'auto'> =
    settings.image_provider && settings.image_provider !== 'auto'
      ? settings.image_provider
      : settings.ai_provider === 'gemini'
        ? 'gemini'
        : settings.ai_provider === 'openai'
          ? 'openai'
          : 'cloudflare';

  const subject =
    input.customPrompt?.trim() ||
    `Editorial magazine cover photograph representing: "${input.titulo}" (category: ${input.trilha}).`;

  const artDirection = `${subject} Style: Apple Newsroom editorial photography, ultra-clean minimalist studio lighting, high visual contrast, shallow depth of field, modern technology aesthetic, subtle red accent detail, 16:9 widescreen composition. STRICTLY NO text, NO letters, NO words, NO logos, NO watermarks.`;

  // 1. Cloudflare Workers AI (100% FREE inside your Cloudflare account — zero API key!)
  if (resolvedProvider === 'cloudflare') {
    const aiBinding = (cfEnv as { AI?: { run: (model: string, input: Record<string, unknown>) => Promise<unknown> } })?.AI;
    if (!aiBinding) {
      throw new Error('Binding Cloudflare Workers AI não disponível neste ambiente (funciona direto em produção na Cloudflare).');
    }
    const model =
      settings.image_model?.trim() && settings.image_model.startsWith('@cf/')
        ? settings.image_model.trim()
        : '@cf/black-forest-labs/flux-1-schnell';

    const params: Record<string, unknown> = model.includes('flux')
      ? { prompt: artDirection, steps: 6 }
      : { prompt: artDirection, width: 1024, height: 576 };

    const result = await aiBinding.run(model, params);
    if (result && typeof result === 'object' && 'image' in result && typeof (result as { image?: string }).image === 'string') {
      return {
        bytes: base64ToUint8Array((result as { image: string }).image),
        contentType: 'image/jpeg',
        ext: 'jpg',
        providerUsed: `cloudflare:${model}`,
      };
    }
    if (result instanceof ReadableStream) {
      const buf = new Uint8Array(await new Response(result).arrayBuffer());
      return {
        bytes: buf,
        contentType: 'image/png',
        ext: 'png',
        providerUsed: `cloudflare:${model}`,
      };
    }
    if (result instanceof Uint8Array) {
      return {
        bytes: result,
        contentType: 'image/png',
        ext: 'png',
        providerUsed: `cloudflare:${model}`,
      };
    }
    throw new Error('Cloudflare Workers AI não retornou bytes de imagem.');
  }

  const apiKey = settings.image_api_key?.trim() || settings.ai_api_key?.trim();
  if (!apiKey) {
    throw new Error('Configure sua chave de API em Minha IA (API) — ou selecione "Cloudflare Workers AI (Grátis, sem chave)".');
  }

  // 2. Hugging Face Inference (Free tier with hf_... token, native 16:9 FLUX.1-schnell)
  if (resolvedProvider === 'huggingface') {
    const model =
      settings.image_model?.trim() && settings.image_model.includes('/') && !settings.image_model.startsWith('@cf/')
        ? settings.image_model.trim()
        : 'black-forest-labs/FLUX.1-schnell';
    const res = await fetch(`https://router.huggingface.co/hf-inference/models/${model}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs: artDirection,
        parameters: { width: 1280, height: 720, num_inference_steps: 4 },
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Hugging Face HTTP ${res.status}: ${err.slice(0, 240)}`);
    }
    const contentType = res.headers.get('content-type') || 'image/jpeg';
    const bytes = new Uint8Array(await res.arrayBuffer());
    return {
      bytes,
      contentType,
      ext: contentType.includes('png') ? 'png' : 'jpg',
      providerUsed: `huggingface:${model}`,
    };
  }

  // 3. fal.ai (Ultra-cheap FLUX Schnell / FLUX Pro, native landscape_16_9)
  if (resolvedProvider === 'fal') {
    const model =
      settings.image_model?.trim() && settings.image_model.startsWith('fal-ai/')
        ? settings.image_model.trim()
        : 'fal-ai/flux/schnell';
    const res = await fetch(`https://fal.run/${model}`, {
      method: 'POST',
      headers: {
        Authorization: `Key ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: artDirection,
        image_size: 'landscape_16_9',
        num_images: 1,
        output_format: 'jpeg',
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`fal.ai HTTP ${res.status}: ${err.slice(0, 240)}`);
    }
    const data = (await res.json()) as { images?: { url?: string; content_type?: string }[] };
    const imgUrl = data.images?.[0]?.url;
    if (!imgUrl) throw new Error('fal.ai não retornou URL da imagem.');
    const safeImgUrl = assertSafeExternalUrl(imgUrl);
    const imgRes = await fetch(safeImgUrl.toString(), { signal: AbortSignal.timeout(15000) });
    if (!imgRes.ok) throw new Error(`Falha ao baixar imagem do fal.ai (HTTP ${imgRes.status}).`);
    const bytes = await readResponseBytesWithLimit(imgRes, 10 * 1024 * 1024);
    const contentType = detectImageMimeFromMagicBytes(bytes) || 'image/jpeg';
    return {
      bytes,
      contentType,
      ext: contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg',
      providerUsed: `fal:${model}`,
    };
  }

  if (resolvedProvider === 'gemini') {
    const model = settings.image_model?.trim() || 'imagen-3.0-generate-002';

    // Support both Imagen (:predict) and native Gemini image models (:generateContent)
    if (model.toLowerCase().includes('imagen')) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:predict`;
      const res = await fetch(url, {
        method: 'POST',
        signal: AbortSignal.timeout(30000),
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          instances: [{ prompt: artDirection }],
          parameters: {
            sampleCount: 1,
            aspectRatio: '16:9',
            outputOptions: { mimeType: 'image/jpeg' },
          },
        }),
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Gemini Imagen HTTP ${res.status}: ${err.slice(0, 260)}`);
      }
      const data = (await res.json()) as {
        predictions?: { bytesBase64Encoded?: string; mimeType?: string }[];
      };
      const pred = data.predictions?.[0];
      if (!pred?.bytesBase64Encoded) {
        throw new Error('Imagen não retornou dados de imagem.');
      }
      const mime = pred.mimeType || 'image/jpeg';
      return {
        bytes: base64ToUint8Array(pred.bytesBase64Encoded),
        contentType: mime,
        ext: mime.includes('png') ? 'png' : 'jpg',
        providerUsed: `gemini:${model}`,
      };
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    const res = await fetch(url, {
      method: 'POST',
      signal: AbortSignal.timeout(30000),
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text: artDirection }] }],
        generationConfig: { responseModalities: ['IMAGE'] },
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Gemini Image HTTP ${res.status}: ${err.slice(0, 260)}`);
    }
    const data = (await res.json()) as {
      candidates?: {
        content?: { parts?: { inlineData?: { data?: string; mimeType?: string } }[] };
      }[];
    };
    const inline = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData;
    if (!inline?.data) {
      throw new Error('Modelo Gemini não retornou imagem.');
    }
    const mime = inline.mimeType || 'image/png';
    return {
      bytes: base64ToUint8Array(inline.data),
      contentType: mime,
      ext: mime.includes('jpeg') || mime.includes('jpg') ? 'jpg' : 'png',
      providerUsed: `gemini:${model}`,
    };
  }

  // OpenAI Images (gpt-image-2.6-sunburst / gpt-image-2.6-flare)
  const model = settings.image_model?.trim() && !settings.image_model.includes('imagen') && !settings.image_model.startsWith('@cf/')
    ? settings.image_model.trim()
    : 'gpt-image-2.6-sunburst';
  const isLegacyDalle = model.includes('dall-e');

  const body: Record<string, unknown> = {
    model,
    prompt: artDirection,
    size: isLegacyDalle ? '1792x1024' : '1536x1024',
    n: 1,
  };
  if (isLegacyDalle) {
    body.response_format = 'b64_json';
    body.quality = 'standard';
  } else {
    body.output_format = 'webp';
  }

  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI Images HTTP ${res.status}: ${err.slice(0, 260)}`);
  }

  const data = (await res.json()) as { data?: { b64_json?: string; url?: string }[] };
  const item = data.data?.[0];
  if (item?.b64_json) {
    return {
      bytes: base64ToUint8Array(item.b64_json),
      contentType: isLegacyDalle ? 'image/png' : 'image/webp',
      ext: isLegacyDalle ? 'png' : 'webp',
      providerUsed: `openai:${model}`,
    };
  }
  if (item?.url) {
    const safeUrl = assertSafeExternalUrl(item.url);
    const imgRes = await fetch(safeUrl.toString(), { signal: AbortSignal.timeout(15000) });
    if (!imgRes.ok) throw new Error(`Falha ao baixar imagem da OpenAI (HTTP ${imgRes.status}).`);
    const buf = await readResponseBytesWithLimit(imgRes, 10 * 1024 * 1024);
    const mime = detectImageMimeFromMagicBytes(buf) || 'image/png';
    return {
      bytes: buf,
      contentType: mime,
      ext: mime.includes('webp') ? 'webp' : mime.includes('jpeg') ? 'jpg' : 'png',
      providerUsed: `openai:${model}`,
    };
  }

  throw new Error('OpenAI não retornou imagem.');
}
