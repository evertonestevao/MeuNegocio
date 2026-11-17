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

/** O período do preço, em texto: "mês", "ano" (ciclo padrão de 12) ou "ciclo de N meses". */
export function planCycleLabel(plan: Pick<PricedPlan, "billing_interval" | "term_payments">): string {
  if (plan.billing_interval === "month") return "mês";
  const parcels = planTermPayments(plan);
  if (parcels === DEFAULT_TERM_PAYMENTS) return "ano";
  return `ciclo de ${parcels} ${parcels === 1 ? "mês" : "meses"}`;
}

/** Economia do plano anual no ciclo, comparada a pagar o mensal pelos mesmos meses. */
export function annualSavingsCents(plans: PricedPlan[]): number {
  const annual = plans.find((plan) => plan.billing_interval === "year" && plan.price_cents > 0);
  const monthly = plans.find((plan) => plan.billing_interval === "month" && plan.price_cents > 0);
  if (!annual || !monthly) return 0;
  return Math.max(0, monthly.price_cents * planTermPayments(annual) - annual.price_cents);
}

/** Planos à venda: sem o padrão gratuito e com o anual primeiro, que é o destaque da oferta. */
export function plansForSale<T extends PricedPlan>(plans: T[]): T[] {
  return plans
    .filter((plan) => plan.price_cents > 0)
    .toSorted((a, b) => Number(b.billing_interval === "year") - Number(a.billing_interval === "year"));
}
