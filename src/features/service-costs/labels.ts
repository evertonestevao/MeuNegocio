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

/**
 * A margem daqui é a realizada (o que já foi gasto); a da lateral do orçamento é a prevista. As duas
 * aparecem com nome, para a pessoa não comparar uma com a outra achando que são a mesma.
 */
export function marginHint(cost: ServiceCost, target: number): string {
  if (cost.marginPercent === null) return "Sem valor cobrado";
  const planned = cost.plannedMarginPercent === null ? "" : ` · prevista ${cost.plannedMarginPercent}%`;
  if (cost.expenseCents + cost.laborCents === 0) return `Nenhum gasto ou hora lançado ainda${planned} · meta ${target}%`;
  if (cost.status === "loss") return `Prejuízo · margem realizada ${cost.marginPercent}%${planned}`;
  if (cost.status === "low") return `Margem realizada ${cost.marginPercent}%, abaixo da meta de ${target}%${planned}`;
  return `Margem realizada ${cost.marginPercent}%${planned} · meta ${target}%`;
}
