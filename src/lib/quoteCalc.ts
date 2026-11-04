import type { PricingMode } from "@/types/database";

/**
 * Cálculo do orçamento. Mesma regra de save_quote no banco, que é quem grava os totais; aqui
 * serve à tela, enquanto a pessoa edita, e ao custo estimado.
 */

export interface QuoteLine {
  pricingMode: PricingMode;
  quantity: number;
  people: number;
  unitPriceCents: number;
}

function multiplier(line: Pick<QuoteLine, "pricingMode" | "quantity" | "people">): number {
  return line.pricingMode === "hourly" ? line.quantity * Math.max(line.people, 1) : line.quantity;
}

/** Fechado = quantidade × preço; por hora = horas × pessoas × valor. Arredonda só no fim da linha. */
export function lineTotalCents(line: QuoteLine): number {
  return Math.round(multiplier(line) * line.unitPriceCents);
}

export function subtotalCents(lines: QuoteLine[]): number {
  return lines.reduce((sum, line) => sum + lineTotalCents(line), 0);
}

/** Total nunca fica negativo, mesmo com desconto maior que o subtotal. */
export function totalCents(lines: QuoteLine[], discountCents: number): number {
  return Math.max(0, subtotalCents(lines) - Math.max(0, discountCents));
}

export interface QuoteCostLine extends Omit<QuoteLine, "unitPriceCents"> {
  /** Custo unitário no catálogo; null quando o item é avulso ou não tem custo. */
  costCents: number | null;
}

/** Só entra quem tem custo no catálogo, com o mesmo multiplicador da venda. */
export function estimatedCostCents(lines: QuoteCostLine[]): number {
  return lines.reduce(
    (sum, line) => sum + (line.costCents ? Math.round(multiplier(line) * line.costCents) : 0),
    0,
  );
}

export type MarkupMode = "percent" | "amount";

/**
 * Preço a partir do custo e do acréscimo: em % sobre o custo ou em reais por unidade. O acréscimo é
 * só a conta de quem monta o orçamento; o cliente vê apenas o preço resultante.
 */
export function priceWithMarkup(costCents: number, markup: number, mode: MarkupMode): number {
  const price = mode === "percent" ? costCents * (1 + markup / 100) : costCents + markup;
  return Math.max(0, Math.round(price));
}

/** Margem em % sobre o preço; null sem preço para comparar. */
export function marginPercent(priceCents: number, costCents: number): number | null {
  if (priceCents <= 0) return null;
  return Math.round(((priceCents - costCents) / priceCents) * 100);
}
