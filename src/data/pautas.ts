export type TrilhaSlug = 'ia' | 'tecnologia' | 'seguranca' | 'negocios' | 'guias';

export interface PautaSubsection {
  heading: string;
  paragraphs: string[];
}

export interface PautaSectionImage {
  url: string;
  alt: string;
  caption?: string;
  credit?: string;
}

export interface PautaSection {
  heading?: string;
  paragraphs: string[];
  subsections?: PautaSubsection[];
  image?: PautaSectionImage;
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
  videoUrl?: string;
  sourceUrls?: string[];
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
    numero: '001',
    slug: 'virada-silenciosa-da-ia-por-que-prompts-longos-perdem-espaco-para-agentes-autonomos',
    trilha: 'ia',
    trilhaLabel: 'IA',
    titulo: 'A virada silenciosa da IA no trabalho: por que prompts longos estão perdendo espaço para agentes autônomos',
    subtitulo:
      'Durante dois anos, dominar inteligência artificial significava escrever comandos perfeitos em uma caixa de texto. Agora, quem ganha tempo de verdade está configurando agentes que pesquisam, conferem dados e executam etapas inteiras sozinhos.',
    resumoCurto:
      'Entenda por que a forma de usar IA mudou da conversa manual no chat para agentes conectados a ferramentas reais, e o que muda na prática para profissionais e empresas.',
    tldr: [
      'A vantagem competitiva deixou de ser escrever prompts gigantes e passou a ser conectar modelos de IA às ferramentas que você já usa todos os dias.',
      'Agentes autônomos conseguem planejar etapas, consultar arquivos, cruzar fontes e entregar o rascunho pronto apenas para revisão humana.',
      'Quem continua usando IA só como caixa de perguntas e respostas aproveita menos de um terço do ganho real de produtividade disponível hoje.',
    ],
    dataPublicacao: '23 NOV 2026',
    dataISO: '2026-11-23T09:00:00-03:00',
    tempoLeitura: '6 MIN',
    autor: {
      nome: 'Jonathas Costa',
      cargo: 'Fundador & Editor',
    },
    imagem: {
      url: 'https://images.unsplash.com/photo-1620712943543-bcc4688e7485?auto=format&fit=crop&w=1600&q=85',
      alt: 'Representação visual minimalista de inteligência artificial e sistemas autônomos modernos',
      credito: 'Foto: Unsplash / Editorial OlhaPauta',
    },
    tags: ['IA', 'AGENTES', 'PRODUTIVIDADE', 'MCP'],
    destaque: true,
    conteudo: [
      {
        paragraphs: [
          'Se você ainda abre uma aba de chat, cola três parágrafos de contexto, corrige a resposta duas vezes e depois copia o texto de volta para a sua planilha ou e-mail, existe uma chance grande de estar usando a inteligência artificial no modo manual. Até pouco tempo atrás, esse era o único jeito possível. Hoje, ele já começa a parecer lento.',
          'Nos últimos meses, uma mudança silenciosa alterou a rotina de equipes de tecnologia, marketing, finanças e redação. Em vez de tratar a IA como um oráculo preso dentro de uma janela de conversa, profissionais passaram a operar com agentes: sistemas capazes de receber um objetivo, quebrar o trabalho em passos menores, consultar fontes externas e executar ações concretas dentro de aplicativos reais.',
        ],
      },
      {
        heading: 'O limite invisível da engenharia de prompt',
        paragraphs: [
          'Quando os primeiros modelos generativos se popularizaram, surgiu uma corrida por "prompts mágicos". Manuais inteiros prometiam resultados superiores se o usuário escrevesse instruções no formato exato. Isso ajudou no início, mas logo esbarrou em um gargalo óbvio: o ser humano continuava sendo a ponte manual entre todas as ferramentas.',
          'Você pesquisava um dado em um site, colava no chat, pedia um resumo, levava o resumo para um documento, conferia um número no banco de dados e voltava para ajustar o texto. A IA acelerava a escrita, mas o trabalho operacional de juntar as peças continuava inteiro nas suas costas.',
        ],
        quote:
          'O verdadeiro salto de produtividade não acontece quando a IA escreve mais rápido, mas quando ela deixa de depender de você copiar e colar contexto o dia inteiro.',
      },
      {
        heading: 'O que um agente de IA faz de diferente na prática',
        paragraphs: [
          'A diferença entre um chatbot tradicional e um agente é simples de visualizar. Um chatbot responde uma pergunta com base no que você colou na tela. Um agente recebe uma missão, decide quais ferramentas precisa consultar, verifica se faltou alguma informação e só devolve o resultado quando a entrega está montada.',
          'Em vez de pedir "escreva uma análise sobre as despesas deste mês" e colar manualmente dez tabelas, você autoriza o agente a ler a pasta de relatórios, cruzar os números com o mês anterior, destacar anomalias e preparar o documento final para sua aprovação. O foco humano sai da digitação repetitiva e vai direto para a decisão.',
        ],
        callout: {
          label: 'CONTEXTO TÉCNICO',
          text: 'Padrões abertos de conexão, como o Model Context Protocol (MCP), aceleraram essa virada ao funcionar como um adaptador universal: qualquer agente compatível consegue ler bancos de dados, repositórios e documentos com permissões controladas, sem precisar de integrações sob medida para cada ferramenta.',
        },
      },
      {
        heading: 'Onde os agentes já funcionam bem e onde ainda exigem cuidado',
        paragraphs: [
          'Nem toda tarefa deve ser entregue no piloto automático. A experiência das equipes que adotaram agentes em produção mostra uma divisão muito clara entre o que já gera ganho imediato e o que ainda precisa de supervisão próxima.',
        ],
        bullets: [
          'Pesquisa e triagem de informações: monitorar fontes confiáveis, resumir documentos longos e organizar pautas ou relatórios diários já funciona com altíssima precisão.',
          'Operações repetitivas entre sistemas: atualizar registros, classificar solicitações, gerar rascunhos padronizados e conferir dados estruturados economiza horas por semana.',
          'Decisões sensíveis e publicação final: aprovações financeiras, respostas jurídicas, posicionamento de marca e publicação editorial continuam exigindo revisão humana antes do envio.',
        ],
      },
      {
        heading: 'Como começar sem complicar a sua rotina',
        paragraphs: [
          'Você não precisa montar uma infraestrutura complexa para sair do modo manual. O caminho mais seguro é escolher uma única tarefa repetitiva que hoje consome 30 minutos do seu dia, mapear quais dados ela usa e testar um fluxo assistido em que a IA prepara 80% do trabalho e você faz a validação final.',
          'A mudança mais importante não é técnica, é de hábito. Quem aprende a delegar etapas claras, definir critérios de qualidade e revisar entregas com senso crítico transforma a inteligência artificial de um simples chat em uma camada real de execução no trabalho.',
        ],
      },
    ],
    faqs: [
      {
        pergunta: 'Qual é a diferença entre um chatbot de IA e um agente autônomo?',
        resposta:
          'Um chatbot tradicional apenas responde às mensagens dentro de uma conversa. Já um agente autônomo consegue dividir um objetivo em etapas, acessar ferramentas externas autorizadas, buscar dados atualizados e entregar uma tarefa estruturada para revisão.',
      },
      {
        pergunta: 'Preciso saber programar para usar agentes de IA no trabalho?',
        resposta:
          'Não necessariamente. Hoje existem plataformas visuais e assistentes corporativos que permitem conectar documentos, planilhas, calendários e e-mails com poucos cliques, mantendo controle sobre o que o agente pode ler ou alterar.',
      },
      {
        pergunta: 'É seguro deixar um agente de IA acessar dados da empresa?',
        resposta:
          'A segurança depende das permissões configuradas. A prática recomendada é conceder acesso apenas de leitura no início, limitar quais pastas ou tabelas o agente enxerga e exigir aprovação humana antes de qualquer ação externa ou publicação.',
      },
      {
        pergunta: 'Prompts bem escritos deixaram de importar?',
        resposta:
          'Não deixaram de importar, mas mudaram de papel. Em vez de escrever prompts gigantes toda vez, você passa a definir regras fixas de contexto, formato e critério de qualidade uma única vez para o agente reutilizar em todas as tarefas.',
      },
    ],
  },
];

export function getPautaBySlug(slug: string): Pauta | undefined {
  return PAUTAS.find((p) => p.slug === slug);
}

export function getNextPauta(currentSlug: string): Pauta | null {
  if (PAUTAS.length <= 1) return null;
  const index = PAUTAS.findIndex((p) => p.slug === currentSlug);
  const nextIndex = index === -1 ? 0 : (index + 1) % PAUTAS.length;
  return PAUTAS[nextIndex];
}

export function getRelatedPautas(currentSlug: string, count = 2): Pauta[] {
  const next = getNextPauta(currentSlug);
  return PAUTAS.filter((p) => p.slug !== currentSlug && p.slug !== next?.slug).slice(0, count);
}
