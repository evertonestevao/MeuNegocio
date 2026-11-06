import { addMonths } from "@/lib/calendar";
import { addDays } from "@/lib/dates";
import { expectedCents, summarizeOpen } from "@/lib/installments";
import { AppError } from "@/lib/errors";
import type { ActorContext } from "@/server/actor";
import type { QuoteListItem, VisitListItem } from "@/types/database";
import type { Expense, ExpenseTemplate, Receivable, RevenueListItem } from "@/types/finance";
import { totalsByCategory } from "./expenseService";
import { permissionService } from "./permissionService";

/**
 * Financeiro e tela de início. Faturado é o que foi vendido (orçamentos fechados, na competência);
 * recebido é o dinheiro que entrou, parcela a parcela; caixa é o recebido menos os gastos. A
 * previsão fica à parte. Member e técnico nunca recebem saldo nem gastos.
 */

export interface FinanceReaders {
  listRevenues(companyId: string, from: string, to: string): Promise<RevenueListItem[]>;
  listExpenses(companyId: string, from: string, to: string): Promise<Expense[]>;
  listExpenseTemplates(companyId: string): Promise<ExpenseTemplate[]>;
  listOpenQuotes(companyId: string): Promise<QuoteListItem[]>;
  listVisits(companyId: string, from: string, to: string): Promise<VisitListItem[]>;
  listOpenReceivables(companyId: string): Promise<Receivable[]>;
  listReceivedReceivables(companyId: string, from: string, to: string): Promise<Receivable[]>;
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
  today: string;
  revenues: RevenueListItem[];
  expenses: Expense[];
  openQuotes: Pick<QuoteListItem, "status" | "total_cents">[];
  /** Parcelas recebidas na janela dos 6 meses. */
  received?: Receivable[];
  /** Todas as parcelas ainda a receber. */
  open?: Receivable[];
}) {
  const { month, today, revenues, expenses, openQuotes, received = [], open = [] } = input;
  const inMonth = <T,>(items: T[], date: (item: T) => string, target: string) =>
    items.filter((item) => date(item).slice(0, 7) === target.slice(0, 7));
  const revenueOf = (target: string) => sum(inMonth(revenues, (item) => item.competence_date, target));
  const expenseOf = (target: string) => sum(inMonth(expenses, (item) => item.expense_date, target));
  const receivedOf = (target: string) =>
    inMonth(received, (item) => item.received_on ?? "", target).reduce((total, item) => total + (item.received_cents ?? 0), 0);

  const monthRevenues = inMonth(revenues, (item) => item.competence_date, month);
  const monthExpenses = inMonth(expenses, (item) => item.expense_date, month);
  const previous = addMonths(month, -1);
  const revenueCents = sum(monthRevenues);
  const expenseCents = sum(monthExpenses);
  const receivedCents = receivedOf(month);

  return {
    revenueCents,
    expenseCents,
    /** Faturado menos gastos: o resultado do mês pelo que foi vendido. */
    balanceCents: revenueCents - expenseCents,
    receivedCents,
    /** Recebido menos gastos: o dinheiro que sobrou de fato. */
    cashCents: receivedCents - expenseCents,
    revenueChange: percentChange(revenueCents, revenueOf(previous)),
    expenseChange: percentChange(expenseCents, expenseOf(previous)),
    receivedChange: percentChange(receivedCents, receivedOf(previous)),
    series: Array.from({ length: 6 }, (_, index) => {
      const target = addMonths(month, index - 5);
      return { month: target, revenueCents: revenueOf(target), receivedCents: receivedOf(target), expenseCents: expenseOf(target) };
    }),
    receivables: {
      ...summarizeOpen(open, today),
      /** Atrasadas e as que vencem nos próximos 30 dias, das mais antigas para as mais novas. */
      upcoming: open.filter((item) => item.due_date <= addDays(today, 30)).slice(0, 8),
    },
    monthReceived: inMonth(received, (item) => item.received_on ?? "", month),
    categories: totalsByCategory(monthExpenses),
    revenues: monthRevenues,
    expenses: monthExpenses,
    forecast: buildForecast(openQuotes),
  };
}

export type FinanceOverview = ReturnType<typeof buildFinanceOverview> & { cashFlow?: CashFlow };

export interface HomeFinance {
  /** Faturamento e gastos dos últimos 6 meses, do mais antigo ao atual. */
  trend: { month: string; revenueCents: number; receivedCents?: number; expenseCents: number }[];
  monthRevenueCents: number;
  monthExpenseCents: number;
  balanceCents: number;
  /** Recebido no mês e caixa (recebido − gastos). */
  monthReceivedCents: number;
  cashCents: number;
  overdueCents: number;
  overdueCount: number;
  receivableSoonCents: number;
  receivableSoonCount: number;
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
  return projectRecurringDated(templates, today, until).map(({ amount_cents }) => ({ amount_cents }));
}

/** As mesmas recorrências ainda não geradas, com a data em que vão vencer. */
export function projectRecurringDated(templates: ExpenseTemplate[], today: string, until: string): (Sized & { date: string })[] {
  const currentMonth = `${today.slice(0, 7)}-01`;
  const lastMonth = `${until.slice(0, 7)}-01`;
  const projected: (Sized & { date: string })[] = [];
  for (let month = addMonths(currentMonth, 1); month <= lastMonth; month = addMonths(month, 1)) {
    for (const template of templates) {
      const inForce =
        template.active &&
        template.starts_on.slice(0, 7) <= month.slice(0, 7) &&
        (template.ends_on === null || template.ends_on.slice(0, 7) >= month.slice(0, 7));
      const date = addDays(month, template.day_of_month - 1);
      if (inForce && date <= until) projected.push({ amount_cents: template.amount_cents, date });
    }
  }
  return projected;
}

export interface CashFlowWeek {
  start: string;
  end: string;
  inCents: number;
  outCents: number;
  /** Entra − sai na semana. */
  netCents: number;
  /** Somado desde hoje, sem o saldo que já está no banco. */
  cumulativeCents: number;
}

export const CASH_FLOW_WEEKS = 4;

/**
 * Fluxo de caixa das próximas semanas, a partir de hoje: entra o que vence das parcelas a receber
 * (já sem a taxa do cartão); sai o que está lançado com data de hoje em diante e as recorrências que
 * ainda vão ser geradas. O atrasado fica à parte: não se sabe quando entra.
 */
export function buildCashFlow(input: {
  today: string;
  open: Pick<Receivable, "due_date" | "amount_cents" | "fee_cents" | "received_on">[];
  expenses: Pick<Expense, "expense_date" | "amount_cents">[];
  templates: ExpenseTemplate[];
  weeks?: number;
}) {
  const { today, open, expenses, templates, weeks = CASH_FLOW_WEEKS } = input;
  const until = addDays(today, weeks * 7 - 1);
  const pending = open.filter((item) => !item.received_on);
  const outgoing = [
    ...expenses.filter((expense) => expense.expense_date >= today && expense.expense_date <= until).map((expense) => ({ date: expense.expense_date, amount_cents: expense.amount_cents })),
    ...projectRecurringDated(templates, today, until),
  ];
  let cumulative = 0;
  const rows: CashFlowWeek[] = Array.from({ length: weeks }, (_, index) => {
    const start = addDays(today, index * 7);
    const end = addDays(start, 6);
    const inCents = pending.filter((item) => item.due_date >= start && item.due_date <= end).reduce((sum, item) => sum + expectedCents(item), 0);
    const outCents = outgoing.filter((item) => item.date >= start && item.date <= end).reduce((sum, item) => sum + item.amount_cents, 0);
    cumulative += inCents - outCents;
    return { start, end, inCents, outCents, netCents: inCents - outCents, cumulativeCents: cumulative };
  });
  return {
    weeks: rows,
    overdueCents: pending.filter((item) => item.due_date < today).reduce((sum, item) => sum + expectedCents(item), 0),
    inCents: rows.reduce((sum, week) => sum + week.inCents, 0),
    outCents: rows.reduce((sum, week) => sum + week.outCents, 0),
  };
}

export type CashFlow = ReturnType<typeof buildCashFlow>;

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
  monthReceivedCents?: number;
  open?: Receivable[];
}): HomeFinance {
  const { today, revenues, monthExpenses, upcoming, projected = [], trend = [], monthReceivedCents = 0, open = [] } = input;
  const monthRevenueCents = sum(revenues);
  const monthExpenseCents = sum(monthExpenses);
  const receivables = summarizeOpen(open, today);
  return {
    trend,
    monthRevenueCents,
    monthExpenseCents,
    balanceCents: monthRevenueCents - monthExpenseCents,
    monthReceivedCents,
    cashCents: monthReceivedCents - monthExpenseCents,
    overdueCents: receivables.overdueCents,
    overdueCount: receivables.overdueCount,
    receivableSoonCents: receivables.dueSoonCents,
    receivableSoonCount: receivables.dueSoonCount,
    dueSoonCents: sum(upcoming) + sum(projected),
    dueSoonCount: upcoming.length + projected.length,
    dueToday: upcoming.filter((expense) => expense.expense_date === today),
  };
}

export function createFinanceService(readers: FinanceReaders) {
  return {
    async getOverview(actor: ActorContext, month: string, today: string): Promise<FinanceOverview> {
      if (!permissionService.canManageFinance(actor.role)) {
        throw new AppError("forbidden", "Só o proprietário e o administrador acessam o financeiro");
      }
      const from = addMonths(month, -5);
      const to = addDays(addMonths(month, 1), -1);
      const flowUntil = addDays(today, CASH_FLOW_WEEKS * 7 - 1);
      const [revenues, expenses, openQuotes, received, open, upcoming, templates] = await Promise.all([
        readers.listRevenues(actor.companyId, from, to),
        readers.listExpenses(actor.companyId, from, to),
        readers.listOpenQuotes(actor.companyId),
        readers.listReceivedReceivables(actor.companyId, from, to),
        readers.listOpenReceivables(actor.companyId),
        readers.listExpenses(actor.companyId, today, flowUntil),
        readers.listExpenseTemplates(actor.companyId),
      ]);
      return {
        ...buildFinanceOverview({ month, today, revenues, expenses, openQuotes, received, open }),
        cashFlow: buildCashFlow({ today, open, expenses: upcoming, templates }),
      };
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
        const [sixMonthRevenues, sixMonthExpenses, upcoming, templates, received, open] = await Promise.all([
          readers.listRevenues(actor.companyId, trendStart, monthEnd),
          readers.listExpenses(actor.companyId, trendStart, monthEnd),
          readers.listExpenses(actor.companyId, today, until),
          readers.listExpenseTemplates(actor.companyId),
          readers.listReceivedReceivables(actor.companyId, trendStart, monthEnd),
          readers.listOpenReceivables(actor.companyId),
        ]);
        const projected = projectUngeneratedRecurring(templates, today, until);
        const overview = buildFinanceOverview({ month: monthStart, today, revenues: sixMonthRevenues, expenses: sixMonthExpenses, openQuotes: [], received, open });
        finance = buildHomeFinance({
          today,
          revenues: overview.revenues,
          monthExpenses: overview.expenses,
          upcoming,
          projected,
          trend: overview.series,
          monthReceivedCents: overview.receivedCents,
          open,
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
