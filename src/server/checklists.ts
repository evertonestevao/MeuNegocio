import "server-only";
import { createSupabaseChecklistRepository } from "@/repositories/supabase/checklistRepository";
import { createChecklistService, type ChecklistService } from "@/services/checklistService";
import { getSupabaseServerClient } from "./supabase-server";

export async function getChecklistService(): Promise<ChecklistService> {
  return createChecklistService(createSupabaseChecklistRepository(await getSupabaseServerClient()));
}
