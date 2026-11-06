import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors";
import type { SignupLeadRepository } from "@/services/signupFlowService";
import type { SignupLead } from "@/types/database";

/**
 * Cadastros iniciados. Só o servidor grava (service_role): a tabela não tem policy de escrita. A
 * listagem do super admin também passa por aqui, depois de a página conferir o papel.
 */
export function createSupabaseSignupLeadRepository(adminClient: SupabaseClient): SignupLeadRepository {
  return {
    async upsertByEmail({ email, fullName, termsVersionId, emailConsent, evidence }) {
      const { data, error } = await adminClient
        .from("signup_leads")
        .upsert(
          {
            email,
            full_name: fullName,
            stage: "contact",
            terms_version_id: termsVersionId,
            accepted_at: new Date().toISOString(),
            email_consent: emailConsent,
            ip_address: evidence.ipAddress,
            user_agent: evidence.userAgent?.slice(0, 500) ?? null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "email" },
        )
        .select("id")
        .single<{ id: string }>();
      if (error || !data) throw new AppError("internal_error", "Falha ao guardar o cadastro", error);
      return data.id;
    },

    async findById(id) {
      const { data, error } = await adminClient.from("signup_leads").select("*").eq("id", id).maybeSingle<SignupLead>();
      if (error) throw new AppError("internal_error", "Falha ao carregar o cadastro", error);
      return data;
    },

    async deletePending(id) {
      const { error } = await adminClient.from("signup_leads").delete().eq("id", id).eq("stage", "contact");
      if (error) throw new AppError("internal_error", "Falha ao apagar o cadastro", error);
    },

    async markAccount(id, { userId, companyId }) {
      const { error } = await adminClient
        .from("signup_leads")
        .update({ stage: "account", user_id: userId, company_id: companyId, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw new AppError("internal_error", "Falha ao atualizar o cadastro", error);
    },

    async markDoneByCompany(companyId) {
      const { error } = await adminClient
        .from("signup_leads")
        .update({ stage: "done", updated_at: new Date().toISOString() })
        .eq("company_id", companyId);
      if (error) throw new AppError("internal_error", "Falha ao atualizar o cadastro", error);
    },

    async listRecent(limit) {
      const { data, error } = await adminClient
        .from("signup_leads")
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(limit)
        .returns<SignupLead[]>();
      if (error) throw new AppError("internal_error", "Falha ao listar os cadastros", error);
      return data ?? [];
    },
  };
}
