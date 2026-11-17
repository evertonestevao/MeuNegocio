import "server-only";
import { createSupabaseAdminOverviewRepository } from "@/repositories/supabase/adminOverviewRepository";
import { createAdminOverviewService } from "@/services/adminOverviewService";
import { getSupabaseServerClient } from "./supabase-server";

/**
 * Visão geral do super admin. Usa o client da SESSÃO (não o service_role): a função do banco confere
 * is_super_admin() pelo usuário logado e recusa qualquer outro.
 */
export async function getAdminOverview() {
  return createAdminOverviewService(createSupabaseAdminOverviewRepository(await getSupabaseServerClient())).get();
}
