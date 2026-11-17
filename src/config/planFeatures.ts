/**
 * Lista fechada dos limites e recursos que um plano pode ter. Chave nova exige código,
 * porque nada a checaria: o painel de planos só edita o que está aqui.
 */
export type PlanFeatureType = "limit" | "flag";

export interface PlanFeatureDefinition {
  key: string;
  label: string;
  type: PlanFeatureType;
}

export const PLAN_FEATURES: readonly PlanFeatureDefinition[] = [
  { key: "max_members", label: "Membros inclusos", type: "limit" },
  { key: "max_clients", label: "Clientes", type: "limit" },
  { key: "max_quotes_month", label: "Orçamentos por mês", type: "limit" },
  { key: "public_approval", label: "Link de aprovação", type: "flag" },
  { key: "work_orders", label: "Ordem de serviço", type: "flag" },
  { key: "hours", label: "Horas", type: "flag" },
];

/** Texto de um limite ou recurso para exibição: limite null é ilimitado. */
export function describePlanFeature(feature: PlanFeatureDefinition, value: unknown): string {
  if (feature.type === "flag") return `${feature.label}: ${value === true ? "sim" : "não"}`;
  return `${feature.label}: ${typeof value === "number" ? value : "ilimitado"}`;
}

const OFFER_LIMITS: Record<string, { limited: (value: number) => string; unlimited: string }> = {
  max_members: { limited: (value) => `Até ${value} ${value === 1 ? "membro incluso" : "membros inclusos"}`, unlimited: "Membros ilimitados" },
  max_clients: { limited: (value) => `Até ${value} ${value === 1 ? "cliente" : "clientes"}`, unlimited: "Clientes ilimitados" },
  max_quotes_month: { limited: (value) => `Até ${value} ${value === 1 ? "orçamento" : "orçamentos"} por mês`, unlimited: "Orçamentos ilimitados" },
};

/** O que um plano inclui, em texto de oferta. Recurso que o plano não tem não aparece. */
export function planOfferLines(features: Record<string, unknown>): string[] {
  return PLAN_FEATURES.flatMap((feature) => {
    const value = features[feature.key];
    if (feature.type === "flag") return value === true ? [feature.label] : [];
    const offer = OFFER_LIMITS[feature.key];
    if (!offer) return [];
    return [typeof value === "number" ? offer.limited(value) : offer.unlimited];
  });
}

/** Parcelas do ciclo do plano anual quando o plano não diz outra coisa (12 cobranças mensais). */
export const DEFAULT_TERM_PAYMENTS = 12;

type PricedPlan = { price_cents: number; billing_interval: "month" | "year"; term_payments?: number };

/** Cobranças mensais que formam um ciclo do plano: 1 no mensal; no anual, as parcelas do plano (padrão 12). */
export function planTermPayments(plan: Pick<PricedPlan, "billing_interval" | "term_payments">): number {
  return plan.billing_interval === "year" ? (plan.term_payments ?? DEFAULT_TERM_PAYMENTS) : 1;
}

/** Quanto o plano custa por mês. O preço do anual vale pelo ciclo inteiro e se divide pelas parcelas. */
export function planMonthlyCents(plan: PricedPlan, cents: number = plan.price_cents): number {
  return Math.round(cents / planTermPayments(plan));
}

/** Nome do ciclo de N parcelas mensais: "mês", "trimestre", "semestre", "ano" ou "ciclo de N meses". */
export function termCycleLabel(termPayments: number): string {
  if (termPayments === 1) return "mês";
  if (termPayments === 3) return "trimestre";
  if (termPayments === 6) return "semestre";
  if (termPayments === DEFAULT_TERM_PAYMENTS) return "ano";
  return `ciclo de ${termPayments} meses`;
}

/** Quando o plano renova: "a cada trimestre", "a cada 5 meses"... (1 parcela = todo mês). */
export function termRenewalLabel(termPayments: number): string {
  if (termPayments === 1) return "todo mês";
  const label = termCycleLabel(termPayments);
  return label.startsWith("ciclo de ") ? `a cada ${termPayments} meses` : `a cada ${label}`;
}

/** O período do preço, em texto: "mês", "trimestre", "semestre", "ano" ou "ciclo de N meses". */
export function planCycleLabel(plan: Pick<PricedPlan, "billing_interval" | "term_payments">): string {
  return plan.billing_interval === "month" ? "mês" : termCycleLabel(planTermPayments(plan));
}

/**
 * Economia de um plano em ciclo, comparada a pagar o mensal pelos mesmos meses. A referência é o
 * mensal pago mais barato da lista: comparar com um mensal mais caro e de outro porte daria um número
 * enganoso. Plano mensal, ou sem mensal para comparar, não tem economia.
 */
export function cycleSavingsCents(plan: PricedPlan, plans: PricedPlan[]): number {
  if (plan.billing_interval !== "year" || plan.price_cents <= 0) return 0;
  const monthlyPrices = plans.filter((other) => other.billing_interval === "month" && other.price_cents > 0).map((other) => other.price_cents);
  if (monthlyPrices.length === 0) return 0;
  return Math.max(0, Math.min(...monthlyPrices) * planTermPayments(plan) - plan.price_cents);
}

/** Opções de cobrança do formulário de novo plano: o mensal e ciclos prontos de parcelas mensais no cartão. */
export type CycleChoice = "month" | "quarter" | "semester" | "year" | "custom";
export const CYCLE_CHOICES: { value: CycleChoice; label: string; termPayments: number | null }[] = [
  { value: "month", label: "Mensal", termPayments: null },
  { value: "quarter", label: "Trimestral (3 parcelas mensais)", termPayments: 3 },
  { value: "semester", label: "Semestral (6 parcelas mensais)", termPayments: 6 },
  { value: "year", label: "Anual (12 parcelas mensais)", termPayments: 12 },
  { value: "custom", label: "Personalizado (de 1 a 12 parcelas)", termPayments: null },
];

/** Planos à venda: sem o padrão gratuito e com o anual primeiro, que é o destaque da oferta. */
export function plansForSale<T extends PricedPlan>(plans: T[]): T[] {
  return plans
    .filter((plan) => plan.price_cents > 0)
    .toSorted((a, b) => Number(b.billing_interval === "year") - Number(a.billing_interval === "year"));
}

/**
 * Troca de plano: só se oferece o que é melhor para quem vende. O candidato entra se tem mensalidade
 * maior OU período maior (vale para trimestral, semestral e anual). Menor e no mesmo período não entra.
 * `currentMonthlyCents` é o que o cliente paga hoje por mês (o preço contratado, não o de tabela).
 */
export function isBetterPlanForOwner(
  current: Pick<PricedPlan, "billing_interval" | "term_payments">,
  currentMonthlyCents: number,
  candidate: PricedPlan,
): boolean {
  if (candidate.price_cents <= 0) return false;
  return planMonthlyCents(candidate) > currentMonthlyCents || planTermPayments(candidate) > planTermPayments(current);
}

/** Planos para os quais a assinatura atual pode migrar (o próprio plano e os piores ficam de fora). */
export function switchablePlans<T extends PricedPlan & { id: string }>(
  current: Pick<PricedPlan, "billing_interval" | "term_payments"> & { id: string },
  currentMonthlyCents: number,
  plans: T[],
): T[] {
  return plans.filter((plan) => plan.id !== current.id && isBetterPlanForOwner(current, currentMonthlyCents, plan));
}
