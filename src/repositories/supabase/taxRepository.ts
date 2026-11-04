import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors";
import type { TaxRepository } from "@/services/taxService";
import type { CompanyTax } from "@/types/tax";

function fail(error: { code?: string; message?: string } | null, message: string): never {
  // As funções do banco levantam P0001 com mensagem pensada para o usuário.
  if (error?.code === "P0001") throw new AppError("conflict", error.message ?? "Operação recusada", error);
  if (error?.code === "42501") throw new AppError("forbidden", "Sem permissão para esta ação", error);
  throw new AppError("internal_error", message, error);
}

export function createSupabaseTaxRepository(client: SupabaseClient): TaxRepository {
  return {
    async get(companyId) {
      const { data, error } = await client.rpc("get_company_tax", { p_company_id: companyId });
      if (error) fail(error, "Falha ao ler os impostos");
      return data as CompanyTax;
    },

    async saveSettings(companyId, input) {
      const { error } = await client.from("company_profiles").upsert({
        company_id: companyId,
        tax_regime: input.taxRegime,
        tax_rate_bps: input.taxRateBps,
        tax_rate_auto: input.taxRateAuto,
        simples_annex: input.simplesAnnex,
        fator_r: input.fatorR,
        activity_started_on: input.activityStartedOn,
      });
      if (error) fail(error, "Falha ao salvar os impostos");
    },

    async saveMonthlyRevenues(companyId, entries) {
      const { error } = await client.rpc("save_monthly_revenues", {
        p_company_id: companyId,
        p_entries: entries.map((entry) => ({ month: entry.month, amount_cents: entry.amountCents })),
      });
      if (error) fail(error, "Falha ao salvar o faturamento informado");
    },
  };
}
