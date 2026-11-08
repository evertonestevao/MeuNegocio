import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors";
import type { CompanyProfileRepository } from "@/services/companyProfileService";
import type { CompanyDocProfile, CompanyProfile } from "@/types/database";

export function createSupabaseCompanyProfileRepository(client: SupabaseClient): CompanyProfileRepository {
  return {
    async get(companyId) {
      const { data, error } = await client
        .from("company_profiles")
        .select("*")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .maybeSingle<CompanyProfile>();
      if (error) throw new AppError("internal_error", "Falha ao ler os dados da empresa", error);
      return data;
    },

    async getForDocument(companyId) {
      // Função security definer: devolve só o subconjunto de contato, então o
      // técnico (sem SELECT na tabela) ainda monta a ordem de serviço.
      const { data, error } = await client.rpc("get_company_doc_profile", { p_company_id: companyId });
      if (error) throw new AppError("internal_error", "Falha ao ler os dados da empresa", error);
      return (data as CompanyDocProfile | null) ?? null;
    },

    async upsert(companyId, input) {
      const { error } = await client.from("company_profiles").upsert({
        company_id: companyId,
        cnpj: input.cnpj,
        phone: input.phone,
        email: input.email,
        address: input.address,
        quote_validity_days: input.quoteValidityDays,
        quote_default_notes: input.quoteDefaultNotes,
        target_margin_percent: input.targetMarginPercent,
        timezone: input.timezone,
      });
      if (error) throw new AppError("internal_error", "Falha ao salvar os dados da empresa", error);
    },
  };
}
