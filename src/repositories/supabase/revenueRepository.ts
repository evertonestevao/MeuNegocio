import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors";
import type { RevenueListItem } from "@/types/finance";

/** Receitas nascem ao fechar um orçamento. A RLS restringe a leitura a owner e admin. */
export function createSupabaseRevenueRepository(client: SupabaseClient) {
  return {
    async list(companyId: string, from: string, to: string): Promise<RevenueListItem[]> {
      const { data, error } = await client
        .from("revenues")
        .select("id, quote_id, amount_cents, competence_date, quote:quotes(number, title, client:clients(name))")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .gte("competence_date", from)
        .lte("competence_date", to)
        .order("competence_date", { ascending: false });
      if (error) throw new AppError("internal_error", "Falha ao acessar o faturamento", error);
      type Row = {
        id: string;
        quote_id: string;
        amount_cents: number;
        competence_date: string;
        quote: { number: number; title: string | null; client: { name: string } | null } | null;
      };
      return ((data ?? []) as unknown as Row[]).map(({ quote, ...row }) => ({
        ...row,
        quote_number: quote?.number ?? 0,
        quote_title: quote?.title ?? null,
        client_name: quote?.client?.name ?? null,
      }));
    },
  };
}
