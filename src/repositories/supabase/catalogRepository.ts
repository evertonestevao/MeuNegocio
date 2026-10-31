import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors";
import type { CatalogRepository } from "@/services/catalogService";
import type { CatalogItem } from "@/types/database";

/** Implementação Supabase do catálogo, com o client do usuário (RLS ativa). */
export function createSupabaseCatalogRepository(client: SupabaseClient): CatalogRepository {
  function fail(error: unknown): never {
    throw new AppError("internal_error", "Falha ao acessar o catálogo", error);
  }

  return {
    async list(companyId, { kind, activeOnly, withCost }) {
      let query = client
        .from("catalog_items")
        .select("*")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("name");
      if (kind) query = query.eq("kind", kind);
      if (activeOnly) query = query.eq("active", true);
      const { data, error } = await query;
      if (error) fail(error);

      const costs = new Map<string, number>();
      if (withCost) {
        const { data: rows, error: costError } = await client
          .from("catalog_item_costs")
          .select("catalog_item_id, cost_cents")
          .eq("company_id", companyId)
          .is("deleted_at", null);
        if (costError) fail(costError);
        for (const row of rows ?? []) costs.set(row.catalog_item_id, row.cost_cents);
      }
      return ((data ?? []) as Omit<CatalogItem, "cost_cents">[]).map((item) => ({
        ...item,
        cost_cents: withCost ? (costs.get(item.id) ?? 0) : null,
      }));
    },

    async get(companyId, itemId) {
      const { data, error } = await client
        .from("catalog_items")
        .select("*")
        .eq("company_id", companyId)
        .eq("id", itemId)
        .is("deleted_at", null)
        .maybeSingle<Omit<CatalogItem, "cost_cents">>();
      if (error) fail(error);
      return data ? { ...data, cost_cents: null } : null;
    },

    async insert(companyId, input) {
      const { data, error } = await client
        .from("catalog_items")
        .insert({
          company_id: companyId,
          kind: input.kind,
          name: input.name,
          description: input.description,
          unit: input.unit,
          pricing_mode: input.pricingMode,
          price_cents: input.priceCents,
          active: input.active,
        })
        .select("*")
        .single<Omit<CatalogItem, "cost_cents">>();
      if (error) fail(error);
      const { error: costError } = await client
        .from("catalog_item_costs")
        .insert({ company_id: companyId, catalog_item_id: data.id, cost_cents: input.costCents });
      if (costError) fail(costError);
      return { ...data, cost_cents: input.costCents };
    },

    async update(companyId, itemId, input) {
      const { error } = await client
        .from("catalog_items")
        .update({
          name: input.name,
          description: input.description,
          unit: input.unit,
          pricing_mode: input.pricingMode,
          price_cents: input.priceCents,
          active: input.active,
        })
        .eq("company_id", companyId)
        .eq("id", itemId)
        .is("deleted_at", null);
      if (error) fail(error);
      const { error: costError } = await client
        .from("catalog_item_costs")
        .upsert({ company_id: companyId, catalog_item_id: itemId, cost_cents: input.costCents });
      if (costError) fail(costError);
    },

    async softDelete(companyId, itemId) {
      const { error } = await client
        .from("catalog_items")
        .update({ deleted_at: new Date().toISOString() })
        .eq("company_id", companyId)
        .eq("id", itemId)
        .is("deleted_at", null);
      if (error) fail(error);
    },
  };
}
