import { addMonths } from "@/lib/calendar";
import { addDays } from "@/lib/dates";
import { AppError } from "@/lib/errors";
import type { ActorContext } from "@/server/actor";
import type { QuoteListItem, VisitListItem } from "@/types/database";
import type { Expense, ExpenseTemplate, RevenueListItem } from "@/types/finance";
import { totalsByCategory } from "./expenseService";
import { permissionService } from "./permissionService";

/**
 * Financeiro e tela de início. Faturamento vem só de orçamentos fechados: a previsão fica à
 * parte e não entra no saldo. Member e técnico nunca recebem saldo nem gastos.
 */

export interface FinanceReaders {
  listRevenues(companyId: string, from: string, to: string): Promise<RevenueListItem[]>;
  listExpenses(companyId: string, from: string, to: string): Promise<Expense[]>;
  listExpenseTemplates(companyId: string): Promise<ExpenseTemplate[]>;
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
  /** Faturamento e gastos dos últimos 6 meses, do mais antigo ao atual. */
  trend: { month: string; revenueCents: number; expenseCents: number }[];
  monthRevenueCents: number;
  monthExpenseCents: number;
  balanceCents: number;
  dueSoonCents: number;
  dueSoonCount: number;
  dueToday: Expense[];
}

/**
 * Recorrências que vencem até `until` em meses ainda não gerados. O mês só é gerado quando começa,
 * então, no fim do mês, as contas do início do próximo ainda não são lançamentos. O mês atual fica
 * de fora: ele já foi gerado, e um lançamento excluído não pode voltar a contar. Regras de
 * vigência iguais às de public.generate_month_expenses.
 */
export function projectUngeneratedRecurring(templates: ExpenseTemplate[], today: string, until: string): Sized[] {
  const currentMonth = `${today.slice(0, 7)}-01`;
  const lastMonth = `${until.slice(0, 7)}-01`;
  const projected: Sized[] = [];
  for (let month = addMonths(currentMonth, 1); month <= lastMonth; month = addMonths(month, 1)) {
    for (const template of templates) {
      const inForce =
        template.active &&
        template.starts_on.slice(0, 7) <= month.slice(0, 7) &&
        (template.ends_on === null || template.ends_on.slice(0, 7) >= month.slice(0, 7));
      if (inForce && addDays(month, template.day_of_month - 1) <= until) {
        projected.push({ amount_cents: template.amount_cents });
      }
    }
  }
  return projected;
}

export interface WeekLoadDay {
  date: string;
  assessment: number;
  execution: number;
}

/** Visitas por dia nos próximos 7 dias, a partir de hoje, separadas por tipo. Canceladas não contam. */
export function buildWeekLoad(visits: Pick<VisitListItem, "visit_date" | "kind" | "status">[], today: string): WeekLoadDay[] {
  return Array.from({ length: 7 }, (_, index) => {
    const date = addDays(today, index);
    const onDay = visits.filter((visit) => visit.visit_date === date && visit.status !== "canceled");
    return {
      date,
      assessment: onDay.filter((visit) => visit.kind === "assessment").length,
      execution: onDay.filter((visit) => visit.kind === "execution").length,
    };
  });
}

export function buildHomeFinance(input: {
  today: string;
  revenues: Sized[];
  monthExpenses: Expense[];
  upcoming: Expense[];
  projected?: Sized[];
  trend?: HomeFinance["trend"];
}): HomeFinance {
  const { today, revenues, monthExpenses, upcoming, projected = [], trend = [] } = input;
  const monthRevenueCents = sum(revenues);
  const monthExpenseCents = sum(monthExpenses);
  return {
    trend,
    monthRevenueCents,
    monthExpenseCents,
    balanceCents: monthRevenueCents - monthExpenseCents,
    dueSoonCents: sum(upcoming) + sum(projected),
    dueSoonCount: upcoming.length + projected.length,
    dueToday: upcoming.filter((expense) => expense.expense_date === today),
  };
}

export function createFinanceService(readers: FinanceReaders) {
  return {
    async getOverview(actor: ActorContext, month: string): Promise<FinanceOverview> {
      if (!permissionService.canManageFinance(actor.role)) {
        throw new AppError("forbidden", "Só o proprietário e o administrador acessam o financeiro");
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
        readers.listVisits(actor.companyId, today, addDays(today, 6)),
        readers.listOpenQuotes(actor.companyId),
      ]);
      const active = visits.filter((visit) => visit.status !== "canceled");

      let finance: HomeFinance | null = null;
      if (permissionService.canManageFinance(actor.role)) {
        const monthStart = `${today.slice(0, 7)}-01`;
        const monthEnd = addDays(addMonths(monthStart, 1), -1);
        const until = addDays(today, 7);
        // Seis meses de uma vez: o mês atual sai do mesmo resultado, para o gráfico.
        const trendStart = addMonths(monthStart, -5);
        const [sixMonthRevenues, sixMonthExpenses, upcoming, templates] = await Promise.all([
          readers.listRevenues(actor.companyId, trendStart, monthEnd),
          readers.listExpenses(actor.companyId, trendStart, monthEnd),
          readers.listExpenses(actor.companyId, today, until),
          readers.listExpenseTemplates(actor.companyId),
        ]);
        const projected = projectUngeneratedRecurring(templates, today, until);
        const overview = buildFinanceOverview({ month: monthStart, revenues: sixMonthRevenues, expenses: sixMonthExpenses, openQuotes: [] });
        finance = buildHomeFinance({
          today,
          revenues: overview.revenues,
          monthExpenses: overview.expenses,
          upcoming,
          projected,
          trend: overview.series,
        });
      }

      return {
        week: buildWeekLoad(active, today),
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
