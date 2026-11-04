import "server-only";
import { estimatedCostCents, type QuoteCostLine } from "@/lib/quoteCalc";
import { createSupabaseServiceCostRepository } from "@/repositories/supabase/serviceCostRepository";
import { createServiceCostService, type ServiceCostService } from "@/services/serviceCostService";
import type { CatalogItem, QuoteItem } from "@/types/database";
import { getSupabaseServerClient } from "./supabase-server";

export async function getServiceCostService(): Promise<ServiceCostService> {
  return createServiceCostService(createSupabaseServiceCostRepository(await getSupabaseServerClient()));
}

/** Custo previsto pelo catálogo; null quando nenhum item do orçamento tem custo cadastrado. */
export function plannedCostCents(items: QuoteItem[], catalog: Pick<CatalogItem, "id" | "cost_cents">[]): number | null {
  const costs = new Map(catalog.map((item) => [item.id, item.cost_cents ?? null]));
  const lines: QuoteCostLine[] = items.map((item) => ({
    pricingMode: item.pricing_mode,
    quantity: Number(item.quantity),
    people: item.people,
    // O custo digitado no orçamento vale mais que o do catálogo.
    costCents: item.cost_cents ?? (item.catalog_item_id ? (costs.get(item.catalog_item_id) ?? null) : null),
  }));
  return lines.some((line) => line.costCents !== null) ? estimatedCostCents(lines) : null;
}
