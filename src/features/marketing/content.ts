import {
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  Clock,
  FileText,
  type LucideIcon,
  PiggyBank,
  ShieldCheck,
  Smartphone,
  Wallet,
} from "lucide-react";
import { brand } from "@/config/brand";

/**
 * Textos da página inicial. Só o que o produto faz hoje: nada de depoimento, número ou promessa
 * que ele não cumpra. Funcionalidade nova que seja argumento de venda entra aqui (ver CLAUDE.md).
 */

export const hero = {
  eyebrow: "Para empresas de serviços com equipe em campo",
  title: "Da visita técnica ao caixa, sem nada se perder no caminho",
  description:
    "Orçamento que o cliente aprova pelo celular, agenda sem choque de horário, ordem de serviço assinada e quanto sobrou em cada serviço. Tudo em um só lugar, no computador e no celular.",
  highlights: ["Nada para instalar", "Aprovação sem criar conta", "No celular e no computador"],
};

/**
 * Pasta das telas da página inicial. Suba a versão a cada nova captura (ver CLAUDE.md): o caminho
 * novo impede que o navegador mostre a imagem antiga do cache.
 */
export const LANDING_SCREENS = "/landing/v8";

/** Telas em destaque. As imagens são capturas reais do sistema, com dados fictícios. */
export const showcases: {
  eyebrow: string;
  title: string;
  description: string;
  points: string[];
  image: string;
  alt: string;
  device: "browser" | "phone";
}[] = [
  {
    eyebrow: "Orçamentos",
    title: "Saiba o que está parado e o que falta fechar",
    description: "Cada orçamento mostra em que etapa está, do rascunho ao fechamento. Nada fica perdido em uma conversa antiga.",
    points: ["Envio em PDF ou pelo WhatsApp", "Link para o cliente aprovar e assinar sem criar conta", "Margem visível só para quem pode ver"],
    image: `${LANDING_SCREENS}/orcamentos.jpg`,
    alt: "Tela de orçamentos com a lista por situação: rascunho, enviado, aprovado e fechado.",
    device: "browser",
  },
  {
    eyebrow: "Agenda",
    title: "Sua equipe nunca em dois lugares ao mesmo tempo",
    description: "Veja o mês e a semana de toda a equipe. O sistema avisa do conflito enquanto você agenda e impede o choque de horário ao salvar.",
    points: ["Visitas técnicas e execuções", "Filtros por pessoa e por tipo", "Agende direto do cliente ou do orçamento"],
    image: `${LANDING_SCREENS}/agenda.jpg`,
    alt: "Agenda do mês com as visitas distribuídas pelos dias e a lista de visitas do dia escolhido.",
    device: "browser",
  },
  {
    eyebrow: "Ordem de serviço",
    title: "O técnico resolve tudo pelo celular",
    description: "Ele chega, marca o checklist, fotografa e colhe a assinatura do cliente. O escritório acompanha sem precisar ligar.",
    points: ["Checklist do seu jeito, por tipo de visita", "Fotos da câmera ou da galeria, com legenda", "Assinatura do cliente e PDF ao concluir"],
    image: `${LANDING_SCREENS}/ordem-servico.jpg`,
    alt: "Ordem de serviço no celular com endereço, contato, equipe e checklist.",
    device: "phone",
  },
  {
    eyebrow: "Serviços",
    title: "Saiba quanto sobrou em cada serviço",
    description:
      "Os serviços aprovados ficam em uma tela só. Lance os gastos de cada um; as horas da equipe e o imposto entram sozinhos no custo. Você vê o resultado antes de faturar.",
    points: ["Custo previsto contra o realizado", "Alerta quando a margem cai abaixo da sua meta", "Conclua e fature direto da lista"],
    image: `${LANDING_SCREENS}/servicos.jpg`,
    alt: "Tela de serviços em andamento, com visitas, valor cobrado, custos e resultado de cada serviço.",
    device: "browser",
  },
  {
    eyebrow: "Financeiro",
    title: "O que vendeu, o que entrou e o que falta receber",
    description: "Serviço fechado não é dinheiro no bolso. Registre à vista, entrada + parcelas ou cartão, dê baixa quando o dinheiro entrar e veja o caixa de verdade do mês, ao lado do faturado.",
    points: ["Contas a receber com aviso de atraso", "Faturado, recebido e gastos em 6 meses", "Gastos por categoria"],
    image: `${LANDING_SCREENS}/financeiro.jpg`,
    alt: "Tela do financeiro com faturado, recebido, gastos, caixa do mês, contas a receber e gráfico de 6 meses.",
    device: "browser",
  },
];

/** Dados fictícios dos gráficos de exemplo. A página sempre avisa que são um exemplo. */
export const sampleFinance = {
  months: [
    { label: "Maio", revenue: 8200, expense: 4800 },
    { label: "Junho", revenue: 9600, expense: 5100 },
    { label: "Julho", revenue: 8900, expense: 4950 },
    { label: "Agosto", revenue: 11400, expense: 5600 },
    { label: "Setembro", revenue: 13700, expense: 5300 },
    { label: "Outubro", revenue: 16100, expense: 6100 },
  ],
  categories: [
    { label: "Funcionários", value: 3200 },
    { label: "Aluguel", value: 1800 },
    { label: "Material", value: 620 },
    { label: "Veículos e combustível", value: 480 },
  ],
};

/** Exemplo do bloco de lucro por serviço. Valores fictícios, sempre avisados na página. */
export const sampleServiceResult = {
  service: "Instalação de 3 splits",
  client: "Clínica do exemplo",
  chargedCents: 480000,
  costs: [
    { label: "Material", detail: "Casa do Eletricista", cents: 112000 },
    { label: "Horas da equipe", detail: "2 técnicos, 12h no total", cents: 72000 },
    { label: "Combustível", detail: "3 idas ao cliente", cents: 18000 },
    { label: "Imposto (estimado)", detail: "Simples Nacional, 8% do valor", cents: 38400 },
  ],
};

export const profitPitch = {
  eyebrow: "Lucro de verdade",
  title: "Você sabe quanto sobrou no último serviço?",
  description: `Quando a compra de material, o combustível e as horas da equipe não ficam ligados ao serviço, o lucro vira palpite. No ${brand.name}, cada gasto e cada hora entram no serviço certo, e você vê o resultado antes de faturar.`,
  points: [
    "Lance o gasto na hora, já no serviço, com o fornecedor e a forma de pagamento",
    "As horas da equipe e o imposto entram sozinhos no custo",
    "Custo previsto contra o realizado, com alerta de margem",
  ],
};

export const sampleFunnel = [
  { label: "Enviados", value: 24 },
  { label: "Aprovados", value: 15 },
  { label: "Fechados", value: 11 },
];

export const pains = [
  {
    title: "Lucro no chute",
    description: "Material comprado na hora, combustível e horas da equipe que ninguém liga ao serviço. No fim, ninguém sabe quanto sobrou.",
  },
  {
    title: "Orçamento que some na conversa",
    description: "Enviado pelo WhatsApp, sem resposta e sem ninguém lembrar de cobrar.",
  },
  {
    title: "Fim do mês sem saber quanto sobrou",
    description: "Horas de prestador, gastos e serviços fechados espalhados em lugares diferentes.",
  },
];

export const journey = [
  { title: "Orçamento", description: "Monte com materiais e horas, envie em PDF ou pelo WhatsApp." },
  { title: "Aprovação", description: "O cliente abre o link, sem criar conta, e aprova com assinatura ou recusa." },
  { title: "Agenda", description: "Escale a equipe. Quem já tem visita no horário é bloqueado." },
  { title: "Execução", description: "No celular, o técnico faz o checklist, fotografa e colhe a assinatura." },
  { title: "Resultado", description: "Lance os gastos do serviço, conclua e veja quanto sobrou nele e no mês." },
];

export const benefits: { icon: LucideIcon; title: string; description: string }[] = [
  {
    icon: FileText,
    title: "Orçamentos",
    description:
      "Número automático, validade, desconto e margem estimada só para quem pode ver. O vencido expira sozinho, e você sabe o que está parado esperando resposta.",
  },
  {
    icon: CalendarDays,
    title: "Agenda da equipe",
    description:
      "Visão de mês e semana, com visitas técnicas e execuções. O sistema avisa do conflito enquanto você agenda e impede o choque de horário ao salvar.",
  },
  {
    icon: ClipboardCheck,
    title: "Ordem de serviço no celular",
    description:
      "Cheguei, checklist, fotos com legenda, relatório e assinatura do cliente. Depois de assinada, a ordem não muda mais e sai em um PDF organizado.",
  },
  {
    icon: PiggyBank,
    title: "Resultado por serviço",
    description:
      "Gastos lançados no serviço, horas da equipe e o imposto estimado viram o custo de cada trabalho. Veja a margem, compare com o previsto e saiba quais serviços dão lucro.",
  },
  {
    icon: ClipboardList,
    title: "Checklist do seu jeito",
    description:
      "Monte a lista padrão de cada tipo de visita, ajuste em um atendimento específico e deixe o técnico incluir o que aparecer no local.",
  },
  {
    icon: Smartphone,
    title: "Aplicativo no celular",
    description:
      "Instale na tela inicial e abra como um aplicativo, com as abas principais embaixo. Sem loja de aplicativos e sem atualização para baixar.",
  },
  {
    icon: Clock,
    title: "Horas de prestadores",
    description:
      "As visitas sugerem as horas de cada PJ ou autônomo. Confira, ajuste e feche o mês: o pagamento já entra nos gastos.",
  },
  {
    icon: Wallet,
    title: "Gastos e financeiro",
    description:
      "Aluguel e salários lançados sozinhos todo mês, gastos por categoria e por fornecedor, contas a receber parcela a parcela e o caixa de verdade do mês. Saiba de quem você mais compra cada coisa.",
  },
  {
    icon: ShieldCheck,
    title: "Cada um vê o que precisa",
    description:
      "O técnico vê só as próprias visitas. O escritório cuida de clientes e orçamentos sem ver custo, margem nem financeiro. Os dados de cada empresa ficam isolados.",
  },
];

export const faq = [
  {
    question: "Preciso instalar alguma coisa?",
    answer: "Não. O sistema funciona no navegador, no computador e no celular. Se quiser, instale no celular como aplicativo, direto da tela inicial, sem loja de aplicativos.",
  },
  {
    question: "Meu cliente precisa criar conta para aprovar o orçamento?",
    answer: "Não. Ele recebe um link, vê os itens e o total, baixa o PDF e responde. Para aprovar, assina com o dedo na tela, e a assinatura fica no orçamento e no PDF. O link de aprovação depende do plano.",
  },
  {
    question: "O técnico consegue ver preços e o financeiro?",
    answer: "Não. Ele vê só as próprias visitas, com o local, o contato e a equipe. Clientes, orçamentos e financeiro ficam de fora.",
  },
  {
    question: "O envio pelo WhatsApp é automático?",
    answer: "Não. O sistema abre o WhatsApp com a mensagem pronta para o contato do cliente, e você confirma o envio.",
  },
  {
    question: "Funciona sem internet?",
    answer: "Ainda não. É preciso ter conexão para salvar a ordem de serviço. Em local sem sinal, o técnico precisa esperar a conexão voltar.",
  },
  {
    question: "Emite nota fiscal?",
    answer: "Não. O sistema controla orçamentos, serviços e o caixa da empresa. A nota continua sendo emitida por fora.",
  },
  {
    question: "O imposto entra na conta do lucro?",
    answer: "Sim. No Simples Nacional, o sistema pode calcular a alíquota do mês pelo faturamento dos últimos 12 meses e pelo anexo da sua atividade, ou você informa a alíquota que o contador passa. O imposto estimado sai do resultado de cada serviço, e dá para mudar a de um serviço específico. A guia oficial continua sendo apurada pelo contador.",
  },
  {
    question: "Dá para controlar quem pagou parcelado?",
    answer: "Sim. Ao fechar o serviço, você registra se foi à vista, entrada + parcelas ou cartão, e o sistema separa o que já entrou do que falta receber. Ele avisa das parcelas atrasadas, desconta a taxa da maquininha do resultado e abre um lembrete pronto no WhatsApp para o cliente.",
  },
  {
    question: "O registro de horas substitui o ponto eletrônico?",
    answer: "Não. Ele serve para gestão e pagamento de prestadores e não substitui o ponto eletrônico de funcionários CLT.",
  },
  {
    question: "Dá para testar antes de assinar?",
    answer: "Sim, por 7 dias, com tudo liberado e sem cartão. Se no fim não quiser assinar, nada é cobrado e seus dados continuam guardados.",
  },
  {
    question: "Como funciona o pagamento e o cancelamento?",
    answer: "No plano anual, você paga em até 12x no cartão e tem 12 meses de acesso, sem renovação automática. No mensal, a cobrança é todo mês, por PIX, boleto ou cartão, e ao cancelar o acesso segue até o fim do período pago. As regras de reembolso estão na nossa política.",
  },
];
