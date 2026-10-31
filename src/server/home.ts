import "server-only";
import { createSupabaseExpenseRepository } from "@/repositories/supabase/expenseRepository";
import { createSupabaseQuoteRepository } from "@/repositories/supabase/quoteRepository";
import { createSupabaseRevenueRepository } from "@/repositories/supabase/revenueRepository";
import { createSupabaseVisitRepository } from "@/repositories/supabase/visitRepository";
import { createFinanceService, type FinanceService } from "@/services/financeService";
import { getSupabaseServerClient } from "./supabase-server";

export async function getFinanceService(): Promise<FinanceService> {
  const client = await getSupabaseServerClient();
  const expenses = createSupabaseExpenseRepository(client);
  const quotes = createSupabaseQuoteRepository(client);
  const revenues = createSupabaseRevenueRepository(client);
  const visits = createSupabaseVisitRepository(client);
  return createFinanceService({
    listRevenues: revenues.list,
    listExpenses: expenses.list,
    listExpenseTemplates: expenses.listTemplates,
    listOpenQuotes: quotes.listOpen,
    listVisits: (companyId, from, to) => visits.list(companyId, { from, to }),
  });
}
