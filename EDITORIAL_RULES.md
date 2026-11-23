# Guia Editorial, Trilhas e Regras do OlhaPauta

Documento oficial de arquitetura editorial e diretrizes de escrita do **OlhaPauta** (`olhapauta.com.br`). Deve ser seguido por qualquer humano, bot, agente ou integração MCP que publique conteúdo no site.

## 1. Posicionamento e Idioma
- **Idioma oficial:** Português do Brasil (`pt-BR`), foco 100% no mercado brasileiro.
- **Formato:** Publicação digital de conteúdo organizado e premium (não portal de manchetes genéricas).
- **Objetivos principais:** Crescimento orgânico em **SEO**, **AIO / GEO** (citações em Google AI Overviews, ChatGPT, Perplexity, Claude e Grok), **Google Discover** e monetização de alto RPM com **Google AdSense**.
- **Stack oficial:** Astro + Tailwind CSS + Supabase + Cloudflare Pages.

## 2. As 5 Trilhas Oficiais

| Slug | Nome | Foco editorial | Papel estratégico |
| :--- | :--- | :--- | :--- |
| `ia` | **IA** | Modelos, agentes autônomos, MCP, ferramentas práticas (`Claude`, `Gemini`, `DeepSeek`, `Grok`, `NotebookLM`), geração de vídeo/áudio e criação de apps com IA. | Carro-chefe, identidade da marca e autoridade tópica. |
| `tecnologia` | **Tecnologia** | Big techs, Apple, Android/iOS, chips, hardware, computação e atualizações relevantes de apps populares. | Motor de volume e recorrência no **Google Discover**. |
| `seguranca` | **Segurança** | Cibersegurança, privacidade, golpes com IA, deepfakes, vazamentos de dados e LGPD. | Top CPC no AdSense BR + altíssimo CTR no **Google Discover**. |
| `negocios` | **Negócios** | IA aplicada a empresas, SaaS, ROI, automação corporativa, mercado de tecnologia e futuro do trabalho. | Maior **RPM** no Google AdSense (público B2B e software corporativo). |
| `guias` | **Guias** | Comparativos profundos ("Ferramenta A vs B"), testes reais e tutoriais passo a passo aplicáveis. | Blindagem contra AI Overviews + tráfego contínuo no Google Search e AIO/GEO. |

### O que evitar
- Não abrir editorias fora do eixo IA/Tecnologia (como Games, Cinema/Séries, Carros ou Espaço), pois diluem a autoridade tópica e reduzem o RPM médio.

## 3. Regras Obrigatórias de Escrita (Anti-IA)
1. **Proibido usar travessão (`—` ou `–`)** em textos corridos, títulos, subtítulos, resumos ou interface. Use vírgula, dois-pontos, ponto final ou `|` (em `<title>`).
2. **Linguagem humana e direta:** proibido usar clichês de texto gerado por IA ("no cenário atual", "é importante ressaltar", "em suma", "mergulhar fundo", "revolucionário", listas artificiais com emojis).
3. **Sem eyebrows desnecessários:** não adicionar rótulos em caixa alta acima de títulos ou blocos da interface.
4. **Estrutura pronta para AIO / GEO e Discover:**
   - Título claro, forte e sem clickbait enganoso.
   - Imagem principal em `16:9` com no mínimo `1200px` de largura (`fetchpriority="high"`, sem lazy-load).
   - Bloco **"O que você precisa saber"** no topo com 3 pontos objetivos.
   - Bloco de **Perguntas frequentes (FAQ)** quando fizer sentido para o tema, alimentando o JSON-LD `FAQPage`.
   - Nunca empilhar dois anúncios sem conteúdo entre eles (respeitar altura mínima reservada para `CLS = 0`).
