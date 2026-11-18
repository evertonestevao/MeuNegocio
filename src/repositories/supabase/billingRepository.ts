import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors";
import type { BillingRepository } from "@/services/billingService";
import type { Plan, Subscription } from "@/types/database";

/**
 * Implementação Supabase do BillingRepository. Recebe o client de fora:
 * anon (RLS ativa) para leituras vindas da UI, service_role para webhooks —
 * quem decide é o chamador (service/route handler), nunca este arquivo.
 */
export function createSupabaseBillingRepository(client: SupabaseClient): BillingRepository {
  function unwrap<T>(result: { data: T | null; error: { message: string } | null }): T | null {
    if (result.error) {
      throw new AppError("internal_error", "Falha ao acessar dados da assinatura", result.error);
    }
    return result.data;
  }

  return {
    async getPlanById(planId) {
      const result = await client
        .from("plans")
        .select("*")
        .eq("id", planId)
        .is("deleted_at", null)
        .maybeSingle<Plan>();
      return unwrap(result);
    },

    async getPlanByCode(code) {
      const result = await client
        .from("plans")
        .select("*")
        .eq("code", code)
        .is("deleted_at", null)
        .maybeSingle<Plan>();
      return unwrap(result);
    },

    async getActiveSubscription(companyId) {
      const result = await client
        .from("subscriptions")
        .select("*")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .maybeSingle<Subscription>();
      return unwrap(result);
    },

    async findSubscriptionByExternalId(externalId) {
      const result = await client
        .from("subscriptions")
        .select("*")
        .eq("external_subscription_id", externalId)
        .is("deleted_at", null)
        .maybeSingle<Subscription>();
      return unwrap(result);
    },

    async findSubscriptionByEndedExternalId(externalId) {
      const result = await client
        .from("subscriptions")
        .select("*")
        .contains("ended_external_ids", [externalId])
        .is("deleted_at", null)
        .limit(1)
        .maybeSingle<Subscription>();
      return unwrap(result);
    },

    async ownerHasSubscriptionHistory(companyId) {
      // Por dono: o teste vale uma vez por pessoa, não por empresa (criar empresa
      // não tem limite). A função no banco acha o dono e checa todas as empresas
      // dele, incluindo o histórico apagado de assinaturas.
      const { data, error } = await client.rpc("owner_has_subscription_history", { p_company_id: companyId });
      if (error) throw new AppError("internal_error", "Falha ao ler o histórico de assinaturas", error);
      return Boolean(data);
    },

    async activatePilot({ companyId, planId, userId }) {
      const { data, error } = await client
        .rpc("activate_pilot_plan", { p_company_id: companyId, p_plan_id: planId, p_user_id: userId })
        .single<Subscription>();
      if (error) {
        if (error.code === "P0002") throw new AppError("not_found", "Plano não encontrado", error);
        if (error.code === "42501") throw new AppError("forbidden", "Só o proprietário ativa o plano", error);
        if (error.message === "already_subscribed") {
          throw new AppError("conflict", "A empresa já tem uma assinatura com acesso.", error);
        }
        throw new AppError("internal_error", "Falha ao ativar o plano piloto", error);
      }
      return data;
    },

    async endPilot({ companyId, actorId }) {
      const { data, error } = await client.rpc("end_pilot_plan", { p_company_id: companyId, p_actor: actorId });
      if (error) {
        if (error.code === "P0002") throw new AppError("not_found", "Esta empresa não está no plano piloto", error);
        throw new AppError("internal_error", "Falha ao encerrar o plano piloto", error);
      }
      const result = data as { subscription_id: string; plan_id: string; removed_emails: string[] };
      return { subscriptionId: result.subscription_id, planId: result.plan_id, removedEmails: result.removed_emails };
    },

    async insertSubscription(data) {
      const result = await client
        .from("subscriptions")
        .insert(data)
        .select("*")
        .single<Subscription>();
      const row = unwrap(result);
      if (!row) throw new AppError("internal_error", "Insert de assinatura não retornou linha");
      return row;
    },

    async countActiveMembers(companyId) {
      const { count, error } = await client
        .from("company_members")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .is("deleted_at", null);
      if (error) {
        throw new AppError("internal_error", "Falha ao contar membros", error);
      }
      return count ?? 0;
    },

    async countPendingInvites(companyId) {
      const { count, error } = await client
        .from("company_invites")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("status", "pending")
        .is("deleted_at", null);
      if (error) {
        throw new AppError("internal_error", "Falha ao contar convites", error);
      }
      return count ?? 0;
    },

    async updateSubscription(id, data) {
      const result = await client
        .from("subscriptions")
        .update(data)
        .eq("id", id)
        .select("*")
        .single<Subscription>();
      const row = unwrap(result);
      if (!row) throw new AppError("internal_error", "Update de assinatura não retornou linha");
      return row;
    },
  };
}
