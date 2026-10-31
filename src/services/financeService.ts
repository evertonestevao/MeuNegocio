import { addMonths } from "@/lib/calendar";
import { addDays } from "@/lib/dates";
import { AppError } from "@/lib/errors";
import type { ActorContext } from "@/server/actor";
import type { QuoteListItem, VisitListItem } from "@/types/database";
import type { Expense, RevenueListItem } from "@/types/finance";
import { totalsByCategory } from "./expenseService";
import { permissionService } from "./permissionService";

/**
 * Financeiro e tela de início. Faturamento vem só de orçamentos fechados: a previsão fica à
 * parte e não entra no saldo. Member e técnico nunca recebem saldo nem gastos.
 */

export interface FinanceReaders {
  listRevenues(companyId: string, from: string, to: string): Promise<RevenueListItem[]>;
  listExpenses(companyId: string, from: string, to: string): Promise<Expense[]>;
  listOpenQuotes(companyId: string): Promise<QuoteListItem[]>;
  listVisits(companyId: string, from: string, to: string): Promise<VisitListItem[]>;
}

type Sized = { amount_cents: number };

function sum(items: Sized[]): number {
  return items.reduce((total, item) => total + item.amount_cents, 0);
}

/** Variação em % sobre o mês anterior; null sem base para comparar. */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

/** O que pode entrar: nada disso está no saldo. */
export function buildForecast(quotes: Pick<QuoteListItem, "status" | "total_cents">[]) {
  const totalOf = (status: string) =>
    quotes.filter((quote) => quote.status === status).reduce((total, quote) => total + quote.total_cents, 0);
  const approvedCents = totalOf("approved");
  const sentCents = totalOf("sent");
  return { approvedCents, sentCents, possibleCents: approvedCents + sentCents };
}

/** Totais do mês, comparação com o anterior e a série dos últimos 6 meses. */
export function buildFinanceOverview(input: {
  month: string;
  revenues: RevenueListItem[];
  expenses: Expense[];
  openQuotes: Pick<QuoteListItem, "status" | "total_cents">[];
}) {
  const { month, revenues, expenses, openQuotes } = input;
  const inMonth = <T,>(items: T[], date: (item: T) => string, target: string) =>
    items.filter((item) => date(item).slice(0, 7) === target.slice(0, 7));
  const revenueOf = (target: string) => sum(inMonth(revenues, (item) => item.competence_date, target));
  const expenseOf = (target: string) => sum(inMonth(expenses, (item) => item.expense_date, target));

  const monthRevenues = inMonth(revenues, (item) => item.competence_date, month);
  const monthExpenses = inMonth(expenses, (item) => item.expense_date, month);
  const previous = addMonths(month, -1);
  const revenueCents = sum(monthRevenues);
  const expenseCents = sum(monthExpenses);

  return {
    revenueCents,
    expenseCents,
    balanceCents: revenueCents - expenseCents,
    revenueChange: percentChange(revenueCents, revenueOf(previous)),
    expenseChange: percentChange(expenseCents, expenseOf(previous)),
    series: Array.from({ length: 6 }, (_, index) => {
      const target = addMonths(month, index - 5);
      return { month: target, revenueCents: revenueOf(target), expenseCents: expenseOf(target) };
    }),
    categories: totalsByCategory(monthExpenses),
    revenues: monthRevenues,
    expenses: monthExpenses,
    forecast: buildForecast(openQuotes),
  };
}

export type FinanceOverview = ReturnType<typeof buildFinanceOverview>;

export interface HomeFinance {
  monthRevenueCents: number;
  monthExpenseCents: number;
  balanceCents: number;
  dueSoonCents: number;
  dueSoonCount: number;
  dueToday: Expense[];
}

export function buildHomeFinance(input: { today: string; revenues: Sized[]; monthExpenses: Expense[]; upcoming: Expense[] }): HomeFinance {
  const { today, revenues, monthExpenses, upcoming } = input;
  const monthRevenueCents = sum(revenues);
  const monthExpenseCents = sum(monthExpenses);
  return {
    monthRevenueCents,
    monthExpenseCents,
    balanceCents: monthRevenueCents - monthExpenseCents,
    dueSoonCents: sum(upcoming),
    dueSoonCount: upcoming.length,
    dueToday: upcoming.filter((expense) => expense.expense_date === today),
  };
}

export function createFinanceService(readers: FinanceReaders) {
  return {
    async getOverview(actor: ActorContext, month: string): Promise<FinanceOverview> {
      if (!permissionService.canManageFinance(actor.role)) {
        throw new AppError("forbidden", "Só owner e admin acessam o financeiro");
      }
      const from = addMonths(month, -5);
      const to = addDays(addMonths(month, 1), -1);
      const [revenues, expenses, openQuotes] = await Promise.all([
        readers.listRevenues(actor.companyId, from, to),
        readers.listExpenses(actor.companyId, from, to),
        readers.listOpenQuotes(actor.companyId),
      ]);
      return buildFinanceOverview({ month, revenues, expenses, openQuotes });
    },

    /** Cada papel só recebe o que tem permissão de ver: finance fica null para o member. */
    async getHome(actor: ActorContext, today: string) {
      if (!permissionService.canManageSchedule(actor.role)) {
        throw new AppError("forbidden", "Sem permissão para acessar o início");
      }
      const tomorrow = addDays(today, 1);
      const [visits, openQuotes] = await Promise.all([
        readers.listVisits(actor.companyId, today, tomorrow),
        readers.listOpenQuotes(actor.companyId),
      ]);
      const active = visits.filter((visit) => visit.status !== "canceled");

      let finance: HomeFinance | null = null;
      if (permissionService.canManageFinance(actor.role)) {
        const monthStart = `${today.slice(0, 7)}-01`;
        const monthEnd = addDays(addMonths(monthStart, 1), -1);
        const [revenues, monthExpenses, upcoming] = await Promise.all([
          readers.listRevenues(actor.companyId, monthStart, monthEnd),
          readers.listExpenses(actor.companyId, monthStart, monthEnd),
          readers.listExpenses(actor.companyId, today, addDays(today, 7)),
        ]);
        finance = buildHomeFinance({ today, revenues, monthExpenses, upcoming });
      }

      return {
        today: active.filter((visit) => visit.visit_date === today),
        tomorrow: active.filter((visit) => visit.visit_date === tomorrow),
        awaitingReply: openQuotes.filter((quote) => quote.status === "sent"),
        awaitingClose: openQuotes.filter((quote) => quote.status === "approved"),
        forecast: buildForecast(openQuotes),
        finance,
      };
    },
  };
}

export type FinanceService = ReturnType<typeof createFinanceService>;
