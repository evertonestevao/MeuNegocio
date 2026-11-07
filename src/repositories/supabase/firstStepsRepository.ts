import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors";
import type { FirstStepsRepository } from "@/services/firstStepsService";

/** Só contagens (head), com a RLS de quem está logado. */
export function createSupabaseFirstStepsRepository(client: SupabaseClient): FirstStepsRepository {
  async function count(table: string, companyId: string): Promise<number> {
    const { count: total, error } = await client
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .is("deleted_at", null);
    if (error) throw new AppError("internal_error", "Falha ao carregar os primeiros passos", error);
    return total ?? 0;
  }

  return {
    async counts(companyId) {
      const [catalogItems, clients, quotes] = await Promise.all([
        count("catalog_items", companyId),
        count("clients", companyId),
        count("quotes", companyId),
      ]);
      return { catalogItems, clients, quotes };
    },
  };
}
