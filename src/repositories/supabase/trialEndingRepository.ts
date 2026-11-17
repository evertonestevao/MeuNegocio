import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors";
import type { TrialEndingRepository } from "@/services/trialEndingService";

type Row = { subscription_id: string; company_id: string; owner_email: string; owner_name: string | null; trial_ends_on: string };

/**
 * Lista de quem será avisado. As funções do banco só respondem ao service_role (a lista traz e-mail
 * de cliente), então este repositório só funciona com o client de servidor, nunca com o do usuário.
 */
export function createSupabaseTrialEndingRepository(admin: SupabaseClient): TrialEndingRepository {
  return {
    async listPending(days) {
      const { data, error } = await admin.rpc("trial_ending_notices", { p_days: days });
      if (error) throw new AppError("internal_error", "Falha ao listar os testes que acabam", error);
      return ((data ?? []) as Row[]).map((row) => ({
        subscriptionId: row.subscription_id,
        companyId: row.company_id,
        ownerEmail: row.owner_email,
        ownerName: row.owner_name,
        trialEndsOn: row.trial_ends_on,
      }));
    },

    async markNotified(subscriptionId) {
      const { error } = await admin.rpc("mark_trial_ending_notified", { p_subscription_id: subscriptionId });
      if (error) throw new AppError("internal_error", "Falha ao marcar o aviso do teste como enviado", error);
    },
  };
}
