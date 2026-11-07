import "server-only";
import { createSupabaseExpenseRepository } from "@/repositories/supabase/expenseRepository";
import { createSupabaseQuoteRepository } from "@/repositories/supabase/quoteRepository";
import { createSupabaseReceivableRepository } from "@/repositories/supabase/receivableRepository";
import { createSupabaseRevenueRepository } from "@/repositories/supabase/revenueRepository";
import { createSupabaseVisitRepository } from "@/repositories/supabase/visitRepository";
import { createFinanceService, type FinanceService } from "@/services/financeService";
import { createFirstStepsService, type FirstStepsService } from "@/services/firstStepsService";
import { createSupabaseFirstStepsRepository } from "@/repositories/supabase/firstStepsRepository";
import { getSupabaseServerClient } from "./supabase-server";

export async function getFinanceService(): Promise<FinanceService> {
  const client = await getSupabaseServerClient();
  const expenses = createSupabaseExpenseRepository(client);
  const quotes = createSupabaseQuoteRepository(client);
  const revenues = createSupabaseRevenueRepository(client);
  const visits = createSupabaseVisitRepository(client);
  const receivables = createSupabaseReceivableRepository(client);
  return createFinanceService({
    listRevenues: revenues.list,
    listExpenses: expenses.list,
    listExpenseTemplates: expenses.listTemplates,
    listOpenQuotes: quotes.listOpen,
    listVisits: (companyId, from, to) => visits.list(companyId, { from, to }),
    listOpenReceivables: receivables.listOpen,
    listReceivedReceivables: receivables.listReceived,
  });
}

export async function getFirstStepsService(): Promise<FirstStepsService> {
  return createFirstStepsService(createSupabaseFirstStepsRepository(await getSupabaseServerClient()));
}
