import "server-only";
import { createSupabaseBillingRepository } from "@/repositories/supabase/billingRepository";
import { createSupabaseExpenseRepository } from "@/repositories/supabase/expenseRepository";
import { createSupabaseHoursRepository } from "@/repositories/supabase/hoursRepository";
import { createBillingService } from "@/services/billingService";
import { createExpenseService, type ExpenseService } from "@/services/expenseService";
import { createHoursService, type HoursService } from "@/services/hoursService";
import { getSupabaseAdminClient } from "./supabase-admin";
import { getSupabaseServerClient } from "./supabase-server";

export async function getHoursService(): Promise<HoursService> {
  return createHoursService({
    repo: createSupabaseHoursRepository(await getSupabaseServerClient()),
    canUseHours: (companyId) =>
      createBillingService(createSupabaseBillingRepository(getSupabaseAdminClient())).canAccessFeature(companyId, "hours"),
  });
}

export async function getExpenseService(): Promise<ExpenseService> {
  return createExpenseService(createSupabaseExpenseRepository(await getSupabaseServerClient()));
}
