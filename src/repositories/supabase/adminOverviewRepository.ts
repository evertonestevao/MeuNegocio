import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors";
import type { AdminOverviewRepository } from "@/services/adminOverviewService";
import type { AdminOverviewRaw } from "@/types/adminOverview";

/** Lê a Visão geral pela função do banco. Precisa do client da sessão: quem decide é is_super_admin(). */
export function createSupabaseAdminOverviewRepository(client: SupabaseClient): AdminOverviewRepository {
  return {
    async get() {
      const { data, error } = await client.rpc("admin_overview");
      if (error) throw new AppError("internal_error", "Falha ao carregar a visão geral", error);
      return data as AdminOverviewRaw;
    },
  };
}
