import "server-only";
import { AppError } from "@/lib/errors";
import { createSupabasePlanRepository } from "@/repositories/supabase/planRepository";
import { createPlanService, type PlanService } from "@/services/planService";
import { getSupabaseAdminClient } from "./supabase-admin";
import { getSupabaseServerClient } from "./supabase-server";

/** Super admin logado, conferido no banco. Toda tela e action do painel passa por aqui. */
export async function getPlatformAdminId(): Promise<string | null> {
  const client = await getSupabaseServerClient();
  const [{ data: userData }, { data: isSuperAdmin }] = await Promise.all([
    client.auth.getUser(),
    client.rpc("is_super_admin"),
  ]);
  return userData.user && isSuperAdmin === true ? userData.user.id : null;
}

export async function requirePlatformAdmin(): Promise<string> {
  const adminId = await getPlatformAdminId();
  if (!adminId) throw new AppError("forbidden", "Acesso restrito ao administrador da plataforma");
  return adminId;
}

/** Usa service_role: chamar só depois de requirePlatformAdmin ou getPlatformAdminId. */
export function getPlanAdminService(): PlanService {
  return createPlanService(createSupabasePlanRepository(getSupabaseAdminClient()));
}
