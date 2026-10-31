import "server-only";
import { createSupabaseBillingRepository } from "@/repositories/supabase/billingRepository";
import { createSupabaseClientRepository } from "@/repositories/supabase/clientRepository";
import { createBillingService } from "@/services/billingService";
import { createClientService, type ClientService } from "@/services/clientService";
import { getSupabaseAdminClient } from "./supabase-admin";
import { getSupabaseServerClient } from "./supabase-server";

export async function getClientService(): Promise<ClientService> {
  const client = await getSupabaseServerClient();
  return createClientService({
    repo: createSupabaseClientRepository(client),
    // service_role só para ler o plano: assinaturas são restritas a owner e admin pela RLS,
    // e o member precisa respeitar o mesmo limite da empresa.
    getClientLimit: (companyId) =>
      createBillingService(createSupabaseBillingRepository(getSupabaseAdminClient())).getFeatureLimit(
        companyId,
        "max_clients",
      ),
  });
}
