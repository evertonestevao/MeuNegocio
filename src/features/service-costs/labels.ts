import type { ServiceCost } from "@/services/serviceCostService";

/** Tudo o que sai do valor cobrado: gastos, horas, imposto estimado e taxa do cartão. */
export function allCostsCents(cost: ServiceCost): number {
  return cost.totalCostCents + cost.taxCents + cost.cardFeeCents;
}

/** Rótulo do cartão de custos, conforme o que entrou na conta. */
export function costsLabel(cost: ServiceCost): string {
  if (cost.cardFeeCents > 0) return cost.taxCents > 0 ? "Custos, imposto e taxas" : "Gastos e taxas";
  return cost.taxCents > 0 ? "Custos e imposto" : "Gastos até agora";
}

/**
 * Dica do card "Quanto sobra", em linguagem simples. Enquanto nada foi lançado, é só a estimativa
 * do orçamento; depois vira o número real, comparado com a meta da empresa.
 */
export function marginHint(cost: ServiceCost, target: number): string {
  if (cost.marginPercent === null) return "Sem valor cobrado";
  if (cost.expenseCents + cost.laborCents === 0) {
    const planned = cost.plannedMarginPercent === null ? "" : ` Pela estimativa, sobra ${cost.plannedMarginPercent}% do valor.`;
    return `Ainda nada gasto — é estimativa.${planned} Meta: ${target}%.`;
  }
  if (cost.status === "loss") return `Prejuízo: gastou mais do que cobrou. Meta: ${target}%.`;
  if (cost.status === "low") return `Sobra ${cost.marginPercent}% do valor — abaixo da meta de ${target}%.`;
  return `Sobra ${cost.marginPercent}% do valor. Meta: ${target}%.`;
}
