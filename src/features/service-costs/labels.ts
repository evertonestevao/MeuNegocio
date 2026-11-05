import type { ServiceCost } from "@/services/serviceCostService";

/** Tudo o que sai do valor cobrado: gastos, horas, imposto estimado e taxa do cartão. */
export function allCostsCents(cost: ServiceCost): number {
  return cost.totalCostCents + cost.taxCents + cost.cardFeeCents;
}

/** Rótulo do cartão de custos, conforme o que entrou na conta. */
export function costsLabel(cost: ServiceCost): string {
  if (cost.cardFeeCents > 0) return cost.taxCents > 0 ? "Custos, imposto e taxas" : "Custos e taxas";
  return cost.taxCents > 0 ? "Custos e imposto" : "Custos";
}
