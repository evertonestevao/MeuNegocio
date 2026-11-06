import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors";
import type { CompanyLogoRepository } from "@/services/companyLogoService";

/** Caminho do logo em company_profiles, com a sessão do usuário: a RLS confere owner ou admin. */
export function createSupabaseCompanyLogoRepository(client: SupabaseClient): CompanyLogoRepository {
  return {
    async getLogoPath(companyId) {
      const { data, error } = await client
        .from("company_profiles")
        .select("logo_path")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .maybeSingle<{ logo_path: string | null }>();
      if (error) throw new AppError("internal_error", "Falha ao ler o logo da empresa", error);
      return data?.logo_path ?? null;
    },

    async setLogoPath(companyId, path) {
      // Empresa sem dados preenchidos ainda não tem linha: nasce com os padrões e o logo.
      const { error } = await client.from("company_profiles").upsert({ company_id: companyId, logo_path: path });
      if (error) throw new AppError("internal_error", "Falha ao salvar o logo da empresa", error);
    },
  };
}
