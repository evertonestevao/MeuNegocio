import "server-only";
import { randomUUID } from "node:crypto";
import { createSupabaseStorageProvider } from "@/adapters/storage/supabaseStorageProvider";
import { createSupabaseBillingRepository } from "@/repositories/supabase/billingRepository";
import { createSupabaseWorkOrderRepository } from "@/repositories/supabase/workOrderRepository";
import { createBillingService } from "@/services/billingService";
import { createWorkOrderService, type WorkOrderService } from "@/services/workOrderService";
import { getSupabaseAdminClient } from "./supabase-admin";
import { getSupabaseServerClient } from "./supabase-server";

const WORK_ORDERS_BUCKET = "work-orders";
const SIGNED_URL_SECONDS = 60 * 60;

export async function getWorkOrderService(): Promise<WorkOrderService> {
  const client = await getSupabaseServerClient();
  const storage = createSupabaseStorageProvider(client, WORK_ORDERS_BUCKET);
  return createWorkOrderService({
    repo: createSupabaseWorkOrderRepository(client),
    files: {
      upload: async (path, content, contentType) => {
        await storage.upload({ path, content, contentType });
      },
      remove: (path) => storage.remove(path),
      createSignedUrl: (path) => storage.createSignedUrl(path, SIGNED_URL_SECONDS),
    },
    // service_role só para ler o plano: assinaturas são restritas a owner e admin pela RLS.
    canUseWorkOrders: (companyId) =>
      createBillingService(createSupabaseBillingRepository(getSupabaseAdminClient())).canAccessFeature(companyId, "work_orders"),
    newId: randomUUID,
  });
}
