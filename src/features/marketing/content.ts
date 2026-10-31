import {
  CalendarDays,
  ClipboardCheck,
  Clock,
  FileText,
  type LucideIcon,
  ShieldCheck,
  Wallet,
} from "lucide-react";

/**
 * Textos da página inicial. Só o que o produto faz hoje: nada de depoimento, número ou promessa
 * que ele não cumpra. Preços e limites não ficam aqui: vêm do banco.
 */

export const hero = {
  eyebrow: "Para empresas de serviços com equipe em campo",
  title: "Da visita técnica ao caixa, sem nada se perder no caminho",
  description:
    "Orçamento que o cliente aprova pelo celular, agenda sem choque de horário, ordem de serviço assinada e o saldo do mês à vista. Tudo em um só lugar, no computador e no celular.",
  highlights: ["Nada para instalar", "Aprovação sem criar conta", "PIX, boleto ou cartão"],
};

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
    points: ["Envio em PDF ou pelo WhatsApp", "Link para o cliente aprovar sem criar conta", "Margem visível só para quem pode ver"],
    image: "/landing/orcamentos.jpg",
    alt: "Tela de orçamentos com a lista por situação: rascunho, enviado, aprovado e fechado.",
    device: "browser",
  },
  {
    eyebrow: "Agenda",
    title: "Sua equipe nunca em dois lugares ao mesmo tempo",
    description: "Veja o mês e a semana de toda a equipe. O sistema avisa do conflito enquanto você agenda e impede o choque de horário ao salvar.",
    points: ["Visitas técnicas e execuções", "Filtros por pessoa e por tipo", "Agende direto do cliente ou do orçamento"],
    image: "/landing/agenda.jpg",
    alt: "Agenda do mês com as visitas distribuídas pelos dias e a lista de visitas do dia escolhido.",
    device: "browser",
  },
  {
    eyebrow: "Ordem de serviço",
    title: "O técnico resolve tudo pelo celular",
    description: "Ele chega, marca o checklist, fotografa e colhe a assinatura do cliente. O escritório acompanha sem precisar ligar.",
    points: ["Fotos com legenda e relatório", "Assinatura do cliente na tela", "PDF pronto ao concluir"],
    image: "/landing/ordem-servico.jpg",
    alt: "Ordem de serviço no celular com endereço, contato, equipe e checklist.",
    device: "phone",
  },
  {
    eyebrow: "Financeiro",
    title: "O saldo do mês sem precisar montar planilha",
    description: "Serviços fechados, gastos, salários e pagamento de prestadores entram no mesmo lugar. A previsão fica separada do saldo, para você não contar com o que ainda não fechou.",
    points: ["Faturamento contra gastos em 6 meses", "Gastos por categoria", "Recorrências lançadas todo mês"],
    image: "/landing/financeiro.jpg",
    alt: "Tela do financeiro com faturamento, gastos, saldo, gráfico de 6 meses e gastos por categoria.",
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

export const sampleFunnel = [
  { label: "Enviados", value: 24 },
  { label: "Aprovados", value: 15 },
  { label: "Fechados", value: 11 },
];

export const pains = [
  {
    title: "Orçamento que some na conversa",
    description: "Enviado pelo WhatsApp, sem resposta e sem ninguém lembrar de cobrar.",
  },
  {
    title: "Técnico em dois lugares ao mesmo tempo",
    description: "Agenda no caderno ou na planilha só mostra o conflito quando o cliente já está esperando.",
  },
  {
    title: "Fim do mês sem saber quanto sobrou",
    description: "Horas de prestador, gastos e serviços fechados espalhados em lugares diferentes.",
  },
];

export const journey = [
  { title: "Orçamento", description: "Monte com materiais e horas, envie em PDF ou pelo WhatsApp." },
  { title: "Aprovação", description: "O cliente abre o link, sem criar conta, e aprova ou recusa." },
  { title: "Agenda", description: "Escale a equipe. Quem já tem visita no horário é bloqueado." },
  { title: "Execução", description: "No celular, o técnico faz o checklist, fotografa e colhe a assinatura." },
  { title: "Caixa", description: "Feche o orçamento, pague os prestadores e veja o saldo do mês." },
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
      "Cheguei, checklist, fotos com legenda, relatório e assinatura do cliente. Depois de assinada, a ordem não muda mais e pode ser baixada em PDF.",
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
      "Aluguel e salários lançados sozinhos todo mês, gastos por categoria e faturamento contra gastos dos últimos 6 meses. A previsão fica separada do saldo.",
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
    answer: "Não. O sistema funciona no navegador, no computador e no celular. O técnico usa a tela de ordem de serviço pelo próprio celular.",
  },
  {
    question: "Meu cliente precisa criar conta para aprovar o orçamento?",
    answer: "Não. Ele recebe um link, vê os itens e o total, baixa o PDF e responde. O link de aprovação depende do plano.",
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
    question: "O registro de horas substitui o ponto eletrônico?",
    answer: "Não. Ele serve para gestão e pagamento de prestadores e não substitui o ponto eletrônico de funcionários CLT.",
  },
  {
    question: "Como funciona o pagamento e o cancelamento?",
    answer: "Você escolhe entre o plano anual, cobrado uma vez por ano, e o mensal, cobrado todo mês. Ao cancelar, o acesso segue até o fim do período pago. As regras de reembolso estão na nossa política.",
  },
];
