import type { PautaPayload } from './editorial-validator';
import type { TrilhaSlug } from '../data/pautas';

export type AiProvider = 'openai' | 'gemini' | 'anthropic' | 'grok' | 'openrouter' | 'custom';
export type ImageProvider = 'auto' | 'gemini' | 'openai';

export interface AiSettings {
  ai_provider: AiProvider;
  ai_model: string;
  ai_api_key: string;
  ai_base_url?: string | null;
  search_api_key?: string | null;
  image_provider?: ImageProvider | null;
  image_model?: string | null;
  image_api_key?: string | null;
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
4. Baseie-se estritamente em fatos reais e atualizados (use os dados pesquisados na web e fontes fornecidas). Nunca invente estatísticas ou citações falsas.
5. Estrutura para Google Discover, Google Search, AIO (AI Overviews) e GEO (ChatGPT/Perplexity):
   - Título (H1): 55 a 85 caracteres, forte, humano, sem clickbait enganoso.
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
  const snippets: string[] = [];
  for (const url of urls.slice(0, 3)) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': 'OlhaPautaBot/1.0 (+https://olhapauta.com.br)' },
      });
      clearTimeout(timeout);
      if (res.ok) {
        const text = stripHtmlToText(await res.text());
        if (text.length > 100) {
          snippets.push(`FONTE (${url}):\n${text}`);
        }
      }
    } catch {
      // Ignore unreachable reference URLs
    }
  }
  return snippets.join('\n\n');
}

async function searchWithTavily(
  apiKey: string,
  query: string
): Promise<{ context: string; urls: string[] }> {
  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: 'basic',
        max_results: 5,
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
      data.answer ? `RESUMO DA PESQUISA WEB: ${data.answer}` : '',
      ...(data.results || []).map(
        (r, i) => `[${i + 1}] ${r.title || ''} (${r.url || ''})\n${(r.content || '').slice(0, 800)}`
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
  const model = settings.ai_model || 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(settings.ai_api_key)}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
  maxTokens = 4500
): Promise<string> {
  if (!settings.ai_api_key) {
    throw new Error('Chave de API não configurada em Minha IA (API).');
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

export async function testAiConnection(
  settings: AiSettings
): Promise<{ ok: boolean; reply?: string; error?: string }> {
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
  input: {
    topic: string;
    trilha: TrilhaSlug;
    foco: 'discover' | 'search';
    sourceUrls?: string[];
    useWebSearch?: boolean;
  }
): Promise<{ draft: Partial<PautaPayload>; webSearchUsed: string }> {
  const focoInstrucao =
    input.foco === 'discover'
      ? 'Foco GOOGLE DISCOVER: ângulo humano, impacto concreto no dia a dia no Brasil, título que desperta curiosidade genuína sem clickbait enganoso.'
      : 'Foco GOOGLE SEARCH + AIO/GEO: guia prático aprofundado, resposta direta logo no primeiro parágrafo, passo a passo e comparativo objetivo.';

  const userSources = input.sourceUrls || [];
  const fetchedRefs = await fetchReferenceSnippets(userSources);

  let tavilyContext = '';
  let discoveredUrls: string[] = [];
  let webSearchUsed = 'none';

  // If Tavily is configured and web search is enabled (for non-Gemini or as extra grounding)
  if (input.useWebSearch && settings.search_api_key && settings.ai_provider !== 'gemini') {
    const tv = await searchWithTavily(settings.search_api_key, `${input.topic} inteligência artificial Brasil 2026`);
    tavilyContext = tv.context;
    discoveredUrls = tv.urls;
    if (tv.context) webSearchUsed = 'tavily';
  }

  const contextBlocks = [
    tavilyContext ? `PESQUISA WEB EM TEMPO REAL:\n${tavilyContext}` : '',
    fetchedRefs ? `CONTEÚDO DOS LINKS DE REFERÊNCIA:\n${fetchedRefs}` : '',
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
    const gem = await callGeminiWithSearch(settings, userPrompt, 5000);
    raw = gem.text;
    discoveredUrls = [...discoveredUrls, ...gem.groundingUrls];
    webSearchUsed = 'gemini-google-search';
  } else {
    raw = await callProvider(settings, userPrompt, 5000);
    if (fetchedRefs && webSearchUsed === 'none') {
      webSearchUsed = 'reference-urls';
    }
  }

  const cleaned = extractJsonObject(raw).replace(/[—–]/g, ', ');
  const parsed = JSON.parse(cleaned) as Partial<PautaPayload>;
  const mergedSources = Array.from(new Set([...userSources, ...discoveredUrls])).slice(0, 6);

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
  const resolvedProvider: 'gemini' | 'openai' =
    settings.image_provider && settings.image_provider !== 'auto'
      ? settings.image_provider
      : settings.ai_provider === 'gemini'
        ? 'gemini'
        : 'openai';

  const apiKey = settings.image_api_key?.trim() || settings.ai_api_key?.trim();
  if (!apiKey) {
    throw new Error('Configure sua chave de API em Minha IA (API) para gerar capas.');
  }

  const subject =
    input.customPrompt?.trim() ||
    `Editorial magazine cover photograph representing: "${input.titulo}" (category: ${input.trilha}).`;

  const artDirection = `${subject} Style: Apple Newsroom editorial photography, ultra-clean minimalist studio lighting, high visual contrast, shallow depth of field, modern technology aesthetic, subtle red accent detail, 16:9 widescreen composition. STRICTLY NO text, NO letters, NO words, NO logos, NO watermarks.`;

  if (resolvedProvider === 'gemini') {
    const model = settings.image_model?.trim() || 'imagen-3.0-generate-002';

    // Support both Imagen (:predict) and native Gemini image models (:generateContent)
    if (model.toLowerCase().includes('imagen')) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:predict?key=${encodeURIComponent(apiKey)}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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

  // OpenAI Images (gpt-image-1 or dall-e-3)
  const model = settings.image_model?.trim() && !settings.image_model.includes('imagen')
    ? settings.image_model.trim()
    : 'gpt-image-1';
  const isDalle3 = model === 'dall-e-3';

  const body: Record<string, unknown> = {
    model,
    prompt: artDirection,
    size: isDalle3 ? '1792x1024' : '1536x1024',
    n: 1,
  };
  if (isDalle3) {
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
      contentType: isDalle3 ? 'image/png' : 'image/webp',
      ext: isDalle3 ? 'png' : 'webp',
      providerUsed: `openai:${model}`,
    };
  }
  if (item?.url) {
    const imgRes = await fetch(item.url);
    const buf = new Uint8Array(await imgRes.arrayBuffer());
    return {
      bytes: buf,
      contentType: 'image/png',
      ext: 'png',
      providerUsed: `openai:${model}`,
    };
  }

  throw new Error('OpenAI não retornou imagem.');
}
