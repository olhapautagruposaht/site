export type TrilhaSlug = 'ia' | 'tecnologia' | 'seguranca' | 'negocios' | 'guias';

export interface PautaSection {
  heading?: string;
  paragraphs: string[];
  quote?: string;
  callout?: {
    label: string;
    text: string;
  };
  bullets?: string[];
}

export interface PautaFaq {
  pergunta: string;
  resposta: string;
}

export interface Pauta {
  numero: string;
  slug: string;
  trilha: TrilhaSlug;
  trilhaLabel: string;
  titulo: string;
  subtitulo: string;
  resumoCurto: string;
  tldr: string[];
  dataPublicacao: string;
  dataISO: string;
  tempoLeitura: string;
  autor: {
    nome: string;
    cargo: string;
  };
  imagem: {
    url: string;
    alt: string;
    credito: string;
  };
  tags: string[];
  destaque?: boolean;
  conteudo: PautaSection[];
  faqs?: PautaFaq[];
}

export const TRILHAS: { slug: TrilhaSlug; nome: string; descricao: string }[] = [
  {
    slug: 'ia',
    nome: 'IA',
    descricao: 'Modelos, agentes autônomos, ferramentas práticas e os avanços que moldam a inteligência artificial.',
  },
  {
    slug: 'tecnologia',
    nome: 'Tecnologia',
    descricao: 'Big techs, hardware, dispositivos, sistemas e lançamentos que impactam o cotidiano.',
  },
  {
    slug: 'seguranca',
    nome: 'Segurança',
    descricao: 'Cibersegurança, privacidade, proteção contra golpes com IA, deepfakes e dados.',
  },
  {
    slug: 'negocios',
    nome: 'Negócios',
    descricao: 'IA aplicada a empresas, SaaS, mercado de tecnologia, carreira e retorno real.',
  },
  {
    slug: 'guias',
    nome: 'Guias',
    descricao: 'Comparativos profundos, testes reais e tutoriais práticos para aplicar hoje.',
  },
];

export const PAUTAS: Pauta[] = [
  {
    numero: '042',
    slug: 'era-dos-agentes-autonomos-como-mcp-mudou-a-arquitetura-da-ia',
    trilha: 'ia',
    trilhaLabel: 'IA',
    titulo: 'A era silenciosa dos agentes: por que o protocolo MCP está redefinindo o software moderno',
    subtitulo:
      'Modelos de linguagem deixaram de ser caixas de texto isoladas. Com conectores padronizados, a IA passou a operar ferramentas reais, mudando a forma como empresas constroem produtos.',
    resumoCurto:
      'Como o Model Context Protocol (MCP) substituiu integrações frágeis por um padrão aberto que conecta modelos a bancos de dados, repositórios e operações reais.',
    tldr: [
      'A grande virada de 2026 não é apenas modelos maiores, mas a padronização de como eles acessam ferramentas externas.',
      'O protocolo MCP reduz drasticamente o custo de integrar IA a bancos de dados, CRMs e fluxos internos.',
      'Empresas de software estão redesenhando suas interfaces para serem operadas tanto por humanos quanto por agentes.',
    ],
    dataPublicacao: '23 NOV 2026',
    dataISO: '2026-11-23T09:00:00-03:00',
    tempoLeitura: '5 MIN',
    autor: {
      nome: 'Redação OlhaPauta',
      cargo: 'Mesa Editorial de IA',
    },
    imagem: {
      url: 'https://images.unsplash.com/photo-1620712943543-bcc4688e7485?auto=format&fit=crop&w=1600&q=85',
      alt: 'Representação minimalista de arquitetura de agentes de inteligência artificial',
      credito: 'Foto: Unsplash / Editorial OlhaPauta',
    },
    tags: ['MCP', 'AGENTES', 'ARQUITETURA'],
    destaque: true,
    conteudo: [
      {
        paragraphs: [
          'Durante os primeiros anos da corrida pela inteligência artificial generativa, a atenção ficou concentrada quase exclusivamente na capacidade bruta dos modelos. Cada lançamento era medido por tabelas de benchmark, velocidade de tokens e tamanho da janela de contexto.',
          'Em 2026, o centro de gravidade mudou. O gargalo deixou de ser o quão inteligente um modelo é em uma conversa isolada, e passou a ser o quão confiável ele consegue ser ao agir dentro dos sistemas reais de uma empresa.',
        ],
      },
      {
        heading: 'Do chatbot isolado ao operador de sistemas',
        paragraphs: [
          'Antes de existir um padrão amplamente adotado, cada equipe precisava escrever conectores sob medida para ligar um modelo ao seu banco de dados, ao e-mail ou ao painel de publicação. Era um trabalho repetitivo, frágil e difícil de auditar.',
          'Com o amadurecimento do Model Context Protocol (MCP), essa camada passou a funcionar como uma porta USB-C para inteligência artificial: você expõe ferramentas, permissões e contextos em um formato único, e qualquer agente compatível consegue operá-las com segurança.',
        ],
        quote:
          'O software mais valioso dos próximos anos não será apenas bonito para humanos clicarem. Ele será estruturado para agentes operarem sem atrito.',
      },
      {
        heading: 'O que muda na prática para quem constrói hoje',
        paragraphs: [
          'Na prática, pequenas equipes conseguem montar operações que antes exigiam dezenas de integrações manuais. Um fluxo editorial, por exemplo, pode pesquisar fontes, cruzar dados em um banco relacional, estruturar rascunhos e aguardar aprovação humana em um único ciclo.',
        ],
        callout: {
          label: 'NOTA TÉCNICA · ARQUITETURA',
          text: 'Sistemas baseados em MCP separam claramente o raciocínio (modelo) da execução (ferramentas). Isso permite trocar o modelo de IA sem precisar reescrever nenhuma integração de negócio.',
        },
        bullets: [
          'Permissões granulares: o agente só enxerga exatamente o que foi autorizado.',
          'Independência de fornecedor: menos dependência de um único laboratório de IA.',
          'Auditoria simples: cada chamada de ferramenta deixa um rastro claro e verificável.',
        ],
      },
      {
        heading: 'O novo papel da curadoria humana',
        paragraphs: [
          'Quanto mais rápida fica a execução automatizada, mais valioso se torna o critério editorial e estratégico. A vantagem competitiva deixou de ser produzir volume, e passou a ser decidir o que merece atenção, clareza e profundidade.',
        ],
      },
    ],
    faqs: [
      {
        pergunta: 'O que é o protocolo MCP na inteligência artificial?',
        resposta:
          'O Model Context Protocol (MCP) é um padrão aberto que padroniza como modelos de IA e agentes se conectam a bancos de dados, APIs e ferramentas externas, eliminando integrações sob medida para cada modelo.',
      },
      {
        pergunta: 'Preciso trocar meu banco de dados ou stack atual para usar MCP?',
        resposta:
          'Não. O MCP funciona como uma camada intermediária leve que expõe recursos já existentes (como Postgres, Supabase, GitHub ou CRMs) com permissões controladas para os agentes.',
      },
      {
        pergunta: 'O uso de agentes com MCP substitui a revisão humana?',
        resposta:
          'Não em operações críticas ou editoriais. A prática mais eficaz em 2026 combina execução e pesquisa automatizadas com aprovação e curadoria humana antes da publicação final.',
      },
    ],
  },
  {
    numero: '041',
    slug: 'modelos-de-raciocinio-profundo-quando-vale-esperar-mais-por-uma-resposta',
    trilha: 'ia',
    trilhaLabel: 'IA',
    titulo: 'Modelos de raciocínio profundo: quando vale pagar mais latência por decisões melhores',
    subtitulo:
      'Nem toda tarefa pede pensamento em cadeia prolongado. Entenda como equilibrar velocidade, custo por token e precisão em fluxos reais de produção.',
    resumoCurto:
      'Um guia objetivo para escolher entre modelos rápidos e modelos de raciocínio estendido sem desperdiçar orçamento ou travar a experiência do usuário.',
    tldr: [
      'Modelos de raciocínio brilham em arquitetura, debugging complexo e síntese estratégica, e não em tarefas simples de classificação.',
      'Roteamento híbrido (modelo rápido na triagem + modelo profundo na análise) reduz custos em até 65%.',
      'Avaliar resultados em tarefas próprias vale muito mais do que seguir rankings genéricos.',
    ],
    dataPublicacao: '21 NOV 2026',
    dataISO: '2026-11-21T10:30:00-03:00',
    tempoLeitura: '6 MIN',
    autor: {
      nome: 'Redação OlhaPauta',
      cargo: 'Mesa Editorial de IA',
    },
    imagem: {
      url: 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&w=1600&q=85',
      alt: 'Visual minimalista de circuitos e processamento de dados',
      credito: 'Foto: Unsplash / Editorial OlhaPauta',
    },
    tags: ['BENCHMARKS', 'CUSTO', 'MODELOS'],
    conteudo: [
      {
        paragraphs: [
          'A promessa dos modelos com tempo de inferência estendido mudou o teto do que a IA consegue resolver sozinha. Problemas de lógica, refatoração de código e análise financeira passaram a ter taxas de acerto inéditas.',
          'Mas colocar um modelo de raciocínio profundo em todas as pontas de um produto é o equivalente técnico a usar um caminhão para entregar uma carta na esquina: fica caro, lento e desnecessário.',
        ],
      },
      {
        heading: 'A regra do roteamento em duas camadas',
        paragraphs: [
          'As equipes mais eficientes hoje operam com roteamento inteligente. Um modelo ultrarrápido faz a leitura inicial, classifica a complexidade do pedido e resolve diretamente 70% a 80% dos casos.',
          'Somente quando há ambiguidade, múltiplas restrições ou risco alto de erro é que o pedido sobe para um modelo de raciocínio profundo.',
        ],
        callout: {
          label: 'DADO DE REFERÊNCIA',
          text: 'Em pipelines editoriais e de engenharia, separar triagem de execução pesada costuma reduzir o custo mensal de API pela metade mantendo a mesma percepção de qualidade.',
        },
      },
    ],
  },
  {
    numero: '040',
    slug: 'o-fim-do-design-generico-como-publicacoes-de-ia-estao-voltando-ao-editorial-puro',
    trilha: 'tecnologia',
    trilhaLabel: 'Tecnologia',
    titulo: 'O fim do visual genérico: por que publicações de tecnologia estão voltando ao editorial puro',
    subtitulo:
      'Em um mar de páginas idênticas cheias de banners e gradientes neon, clareza tipográfica e silêncio visual viraram o novo sinal de autoridade.',
    resumoCurto:
      'Por que o leitor moderno abandona portais poluídos em segundos e o que as publicações digitais mais admiradas estão fazendo para recuperar atenção real.',
    tldr: [
      'A saturação de templates idênticos tornou o minimalismo editorial um diferencial imediato de confiança.',
      'Leitura em coluna única, contraste limpo e carregamento instantâneo elevam drasticamente o tempo de permanência.',
      'No Google Discover, páginas limpas e estáveis (Core Web Vitals no verde) superam portais pesados em retenção.',
    ],
    dataPublicacao: '19 NOV 2026',
    dataISO: '2026-11-19T14:00:00-03:00',
    tempoLeitura: '4 MIN',
    autor: {
      nome: 'Redação OlhaPauta',
      cargo: 'Mesa Editorial de IA',
    },
    imagem: {
      url: 'https://images.unsplash.com/photo-1455390582262-044cdead277a?auto=format&fit=crop&w=1600&q=85',
      alt: 'Estética editorial minimalista com papel e escrita',
      credito: 'Foto: Unsplash / Editorial OlhaPauta',
    },
    tags: ['DESIGN', 'DISCOVER', 'EDITORIAL'],
    conteudo: [
      {
        paragraphs: [
          'Basta abrir cinco portais de tecnologia escolhidos ao acaso para notar o mesmo padrão: caixas competindo por atenção, pop-ups interrompendo o primeiro parágrafo e anúncios que empurram o texto para fora da tela.',
          'O efeito colateral foi previsível: o leitor passou a associar excesso visual a conteúdo raso. Em resposta, as publicações mais respeitadas voltaram aos fundamentos do papel impresso: margens generosas, tipografia impecável e zero ruído.',
        ],
      },
      {
        heading: 'Atenção é um ativo de confiança',
        paragraphs: [
          'Quando uma página carrega em menos de um segundo e entrega exatamente o que o título prometeu, o leitor relaxa e continua para a próxima pauta. Design premium não é sobre adicionar elementos; é sobre remover tudo o que atrapalha o entendimento.',
        ],
      },
    ],
  },
  {
    numero: '039',
    slug: 'guia-pratico-como-estruturar-um-fluxo-editorial-assistido-por-ia-sem-perder-a-voz',
    trilha: 'guias',
    trilhaLabel: 'Guias',
    titulo: 'Como estruturar um fluxo editorial assistido por IA sem perder rigor nem voz própria',
    subtitulo:
      'Um passo a passo prático para combinar coleta automatizada, verificação de fontes e revisão humana em um sistema leve e escalável.',
    resumoCurto:
      'A arquitetura exata de 4 etapas para transformar sinais dispersos da web em conteúdo original, verificável e agradável de ler.',
    tldr: [
      'Automação funciona melhor na coleta, organização e checagem estrutural do que na geração sem critério.',
      'Definir um manual de estilo curto e objetivo evita o tom robótico e repetitivo nos textos.',
      'Separar rascunho de publicação em um banco estruturado garante controle total sobre o que vai ao ar.',
    ],
    dataPublicacao: '17 NOV 2026',
    dataISO: '2026-11-17T08:15:00-03:00',
    tempoLeitura: '7 MIN',
    autor: {
      nome: 'Redação OlhaPauta',
      cargo: 'Mesa Editorial de IA',
    },
    imagem: {
      url: 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1600&q=85',
      alt: 'Detalhe de hardware e precisão técnica para guia de fluxo editorial',
      credito: 'Foto: Unsplash / Editorial OlhaPauta',
    },
    tags: ['WORKFLOW', 'AUTOMAÇÃO', 'GUIA'],
    conteudo: [
      {
        paragraphs: [
          'Usar inteligência artificial na produção de conteúdo não significa apertar um botão e publicar qualquer texto. O resultado desse atalho é sempre o mesmo: artigos genéricos que ninguém termina de ler e que os algoritmos rapidamente ignoram.',
          'O caminho sustentável usa a IA como uma mesa de pesquisa incansável: ela monitora fontes primárias, organiza dados, aponta lacunas e prepara a estrutura, enquanto o critério editorial define o ângulo e a clareza final.',
        ],
      },
    ],
  },
  {
    numero: '038',
    slug: 'ia-local-em-notebooks-o-que-ja-roda-sem-nuvem-e-onde-ainda-ha-limite',
    trilha: 'seguranca',
    trilhaLabel: 'Segurança',
    titulo: 'IA local no notebook: o que já roda offline com qualidade real e onde ainda há limite',
    subtitulo:
      'Modelos compactos evoluíram rápido o bastante para transformar tarefas privadas em processamento 100% local, sem custo por requisição.',
    resumoCurto:
      'Testamos o estado atual dos modelos locais para resumo de documentos, código e transcrição, mostrando quando vale abrir mão da nuvem.',
    tldr: [
      'Resumo de PDFs, transcrição de áudio e autocompletar de código já rodam com folga em notebooks modernos.',
      'Privacidade absoluta e custo zero por token tornam a IA local ideal para documentos sensíveis.',
      'Para raciocínio aberto e pesquisa em larga escala, modelos de fronteira na nuvem ainda lideram com margem.',
    ],
    dataPublicacao: '15 NOV 2026',
    dataISO: '2026-11-15T11:00:00-03:00',
    tempoLeitura: '5 MIN',
    autor: {
      nome: 'Redação OlhaPauta',
      cargo: 'Mesa Editorial de IA',
    },
    imagem: {
      url: 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?auto=format&fit=crop&w=1600&q=85',
      alt: 'Notebook minimalista estilo Apple sobre mesa limpa',
      credito: 'Foto: Unsplash / Editorial OlhaPauta',
    },
    tags: ['LOCAL AI', 'PRIVACIDADE', 'HARDWARE'],
    conteudo: [
      {
        paragraphs: [
          'A evolução dos modelos compactos quantizados tornou viável rodar assistentes competentes diretamente no chip do seu computador, sem enviar uma única linha de dados para servidores externos.',
          'Para quem lida com contratos, notas pessoais ou código proprietário, a combinação de IA local no dia a dia com modelos de nuvem apenas para tarefas pesadas já é o padrão mais inteligente.',
        ],
      },
    ],
  },
  {
    numero: '037',
    slug: 'como-empresas-brasileiras-estao-medindo-roi-real-em-projetos-de-ia',
    trilha: 'negocios',
    trilhaLabel: 'Negócios',
    titulo: 'Como empresas brasileiras estão medindo ROI real em projetos de IA em 2026',
    subtitulo:
      'Passada a fase dos pilotos experimentais, lideranças técnicas agora cobram métricas concretas de tempo economizado, margem e qualidade operacional.',
    resumoCurto:
      'Quais indicadores realmente funcionam para separar automações que trazem retorno financeiro de experimentos que só consomem orçamento de API.',
    tldr: [
      'Projetos de IA que sobrevivem ao primeiro trimestre têm uma métrica clara de tempo ou custo por tarefa.',
      'Operações de atendimento, triagem documental e engenharia lideram o retorno mensurável no Brasil.',
      'Treinamento de equipe e revisão de processos pesam mais no resultado do que a troca constante de modelo.',
    ],
    dataPublicacao: '12 NOV 2026',
    dataISO: '2026-11-12T09:30:00-03:00',
    tempoLeitura: '6 MIN',
    autor: {
      nome: 'Redação OlhaPauta',
      cargo: 'Mesa Editorial de IA',
    },
    imagem: {
      url: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1600&q=85',
      alt: 'Arquitetura corporativa moderna com vidro e linhas limpas',
      credito: 'Foto: Unsplash / Editorial OlhaPauta',
    },
    tags: ['MERCADO', 'ROI', 'ESTRATÉGIA'],
    conteudo: [
      {
        paragraphs: [
          'Depois de dois anos marcados por demonstrações impressionantes e poucos resultados práticos, o mercado corporativo entrou em uma fase pragmática. A pergunta deixou de ser qual modelo usar e passou a ser qual gargalo real está sendo resolvido.',
          'Equipes que tratam IA como infraestrutura operacional, medindo tempo de ciclo e taxa de retrabalho antes e depois da implantação, colhem ganhos consistentes sem inflar a conta de nuvem.',
        ],
      },
    ],
  },
];

export function getPautaBySlug(slug: string): Pauta | undefined {
  return PAUTAS.find((p) => p.slug === slug);
}

export function getNextPauta(currentSlug: string): Pauta {
  const index = PAUTAS.findIndex((p) => p.slug === currentSlug);
  const nextIndex = index === -1 ? 0 : (index + 1) % PAUTAS.length;
  return PAUTAS[nextIndex];
}

export function getRelatedPautas(currentSlug: string, count = 2): Pauta[] {
  const next = getNextPauta(currentSlug);
  return PAUTAS.filter((p) => p.slug !== currentSlug && p.slug !== next.slug).slice(0, count);
}
