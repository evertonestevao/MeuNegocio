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
  { key: "audit_retention_days", label: "Dias de auditoria", type: "limit" },
  { key: "public_approval", label: "Link de aprovação", type: "flag" },
  { key: "work_orders", label: "Ordem de serviço", type: "flag" },
  { key: "hours", label: "Horas", type: "flag" },
];

/** Texto de um limite ou recurso para exibição: limite null é ilimitado. */
export function describePlanFeature(feature: PlanFeatureDefinition, value: unknown): string {
  if (feature.type === "flag") return `${feature.label}: ${value === true ? "sim" : "não"}`;
  return `${feature.label}: ${typeof value === "number" ? value : "ilimitado"}`;
}
