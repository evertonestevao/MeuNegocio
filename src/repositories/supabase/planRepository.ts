import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors";
import type { PlanRepository } from "@/services/planService";
import type { Plan, PlanAuditEntry } from "@/types/database";

/** Catálogo de planos. Escrita só por RPC do service_role: o client quem injeta é src/server/plans.ts. */
export function createSupabasePlanRepository(client: SupabaseClient): PlanRepository {
  function fail(error: unknown): never {
    throw new AppError("internal_error", "Falha ao acessar os planos", error);
  }

  return {
    async list() {
      const { data, error } = await client
        .from("plans")
        .select("*")
        .is("deleted_at", null)
        .order("price_cents", { ascending: true });
      if (error) fail(error);
      return (data ?? []) as Plan[];
    },

    async getById(id) {
      const { data, error } = await client
        .from("plans")
        .select("*")
        .eq("id", id)
        .is("deleted_at", null)
        .maybeSingle<Plan>();
      if (error) fail(error);
      return data;
    },

    async getByCode(code) {
      const { data, error } = await client.from("plans").select("*").eq("code", code).maybeSingle<Plan>();
      if (error) fail(error);
      return data;
    },

    async save({ planId, code, input, actorId }) {
      const { data, error } = await client.rpc("admin_save_plan", {
        p_plan_id: planId,
        p_code: code,
        p_name: input.name,
        p_price_cents: input.priceCents,
        p_extra_seat_price_cents: input.extraSeatPriceCents,
        p_features: input.features,
        p_custom_text: input.customText,
        p_payment_methods: input.paymentMethods,
        p_trial_days: input.trialDays,
        p_actor: actorId,
      });
      if (error) fail(error);
      return data as Plan;
    },

    async setActive({ planId, isActive, actorId }) {
      const { data, error } = await client.rpc("admin_set_plan_active", {
        p_plan_id: planId,
        p_is_active: isActive,
        p_actor: actorId,
      });
      if (error) fail(error);
      return data as Plan;
    },

    async listAudit(limit) {
      const { data, error } = await client
        .from("plan_audit_log")
        .select("*")
        .order("changed_at", { ascending: false })
        .limit(limit);
      if (error) fail(error);
      const rows = (data ?? []) as Omit<PlanAuditEntry, "changed_by_name">[];

      const actorIds = [...new Set(rows.flatMap((row) => (row.changed_by ? [row.changed_by] : [])))];
      const { data: profiles, error: profilesError } = actorIds.length
        ? await client.from("profiles").select("id, full_name").in("id", actorIds)
        : { data: [], error: null };
      if (profilesError) fail(profilesError);
      const names = new Map((profiles ?? []).map((profile) => [profile.id, profile.full_name]));

      return rows.map((row) => ({
        ...row,
        changed_by_name: row.changed_by ? (names.get(row.changed_by) ?? null) : null,
      }));
    },
  };
}
