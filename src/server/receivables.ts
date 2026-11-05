import "server-only";
import { createSupabaseReceivableRepository } from "@/repositories/supabase/receivableRepository";
import { createReceivableService, type ReceivableService } from "@/services/receivableService";
import { getSupabaseServerClient } from "./supabase-server";

export async function getReceivableService(): Promise<ReceivableService> {
  return createReceivableService(createSupabaseReceivableRepository(await getSupabaseServerClient()));
}
