import { AppError } from "@/lib/errors";
import { estimatedCostCents, marginPercent } from "@/lib/quoteCalc";
import type { ActorContext } from "@/server/actor";
import type { Expense } from "@/types/finance";
import { totalsByCategory, type CategoryTotal } from "./expenseService";
import { permissionService } from "./permissionService";

/**
 * Custos e resultado de um serviço (orçamento aprovado ou fechado). Os gastos são os mesmos do
 * caixa, ligados ao orçamento; a mão de obra vem das horas das visitas do orçamento. A hora do CLT
 * já sai no salário do mês: aqui ela é custo apropriado ao serviço, não uma saída a mais.
 */

export interface LaborEntry {
  quote_id: string;
  employee_id: string;
  employee_name: string;
  minutes: number;
}

export interface LaborRate {
  employee_id: string;
  hourly_cost_cents: number;
  hourly_pay_cents: number;
}

export interface ServiceQuoteOption {
  id: string;
  number: number;
  title: string | null;
  client_name: string | null;
}

export type ServiceStage = "open" | "done";

export interface ServiceQuoteRow {
  id: string;
  number: number;
  title: string | null;
  client_name: string | null;
  total_cents: number;
  approved_at: string | null;
  closed_at: string | null;
}

export interface ServiceVisit {
  quote_id: string;
  visit_date: string;
  starts_at: string;
  status: "scheduled" | "in_progress" | "completed" | "canceled";
}

export interface PlannedLine {
  quote_id: string;
  pricingMode: "fixed" | "hourly";
  quantity: number;
  people: number;
  costCents: number | null;
}

export interface ServiceCostRepository {
  listQuoteOptions(companyId: string): Promise<ServiceQuoteOption[]>;
  listServiceQuotes(companyId: string, stage: ServiceStage): Promise<ServiceQuoteRow[]>;
  listServiceVisits(companyId: string, quoteIds: string[]): Promise<ServiceVisit[]>;
  listPlannedLines(companyId: string, quoteIds: string[]): Promise<PlannedLine[]>;
  listExpenses(companyId: string, quoteIds: string[]): Promise<Expense[]>;
  listLabor(companyId: string, quoteIds: string[]): Promise<LaborEntry[]>;
  listRates(companyId: string, employeeIds: string[]): Promise<LaborRate[]>;
}

export type MarginStatus = "good" | "low" | "loss" | "none";

export interface LaborLine {
  employeeId: string;
  name: string;
  minutes: number;
  rateCents: number;
  costCents: number;
}

export interface ServiceCost {
  revenueCents: number;
  expenseCents: number;
  laborCents: number;
  totalCostCents: number;
  resultCents: number;
  marginPercent: number | null;
  status: MarginStatus;
  plannedCostCents: number | null;
  categories: CategoryTotal[];
  labor: LaborLine[];
  /** Horas sem custo por hora cadastrado: o resultado fica otimista. */
  laborWithoutRate: boolean;
  expenses: Expense[];
}

/** Custo por hora: o cadastrado; sem ele, o valor pago por hora ao prestador. */
export function laborRateCents(rate: LaborRate | undefined): number {
  if (!rate) return 0;
  return rate.hourly_cost_cents > 0 ? rate.hourly_cost_cents : rate.hourly_pay_cents;
}

export function marginStatus(resultCents: number, margin: number | null, targetPercent: number): MarginStatus {
  if (margin === null) return "none";
  if (resultCents < 0) return "loss";
  return margin >= targetPercent ? "good" : "low";
}

export function buildServiceCost(input: {
  revenueCents: number;
  plannedCostCents: number | null;
  expenses: Expense[];
  labor: LaborEntry[];
  rates: LaborRate[];
  targetMarginPercent: number;
}): ServiceCost {
  const rates = new Map(input.rates.map((rate) => [rate.employee_id, rate]));
  const byPerson = new Map<string, LaborLine>();
  for (const entry of input.labor) {
    const line = byPerson.get(entry.employee_id) ?? {
      employeeId: entry.employee_id,
      name: entry.employee_name,
      minutes: 0,
      rateCents: laborRateCents(rates.get(entry.employee_id)),
      costCents: 0,
    };
    line.minutes += Math.max(0, entry.minutes);
    byPerson.set(entry.employee_id, line);
  }
  const labor = [...byPerson.values()]
    .map((line) => ({ ...line, costCents: Math.round((line.minutes / 60) * line.rateCents) }))
    .sort((a, b) => b.costCents - a.costCents || b.minutes - a.minutes);

  const expenseCents = input.expenses.reduce((sum, expense) => sum + expense.amount_cents, 0);
  const laborCents = labor.reduce((sum, line) => sum + line.costCents, 0);
  const totalCostCents = expenseCents + laborCents;
  const resultCents = input.revenueCents - totalCostCents;
  const margin = marginPercent(input.revenueCents, totalCostCents);
  const categories = totalsByCategory(input.expenses);
  if (laborCents > 0) {
    categories.push({ categoryId: "labor", name: "Mão de obra (horas)", totalCents: laborCents });
    categories.sort((a, b) => b.totalCents - a.totalCents);
  }

  return {
    revenueCents: input.revenueCents,
    expenseCents,
    laborCents,
    totalCostCents,
    resultCents,
    marginPercent: margin,
    status: marginStatus(resultCents, margin, input.targetMarginPercent),
    plannedCostCents: input.plannedCostCents,
    categories,
    labor,
    laborWithoutRate: labor.some((line) => line.minutes > 0 && line.rateCents === 0),
    expenses: input.expenses,
  };
}

export interface ServiceQuoteRef {
  id: string;
  totalCents: number;
  plannedCostCents: number | null;
}

export interface ServiceListItem {
  quote: ServiceQuoteRow;
  visitsDone: number;
  visitsTotal: number;
  inProgress: boolean;
  nextVisit: ServiceVisit | null;
  /** Só para quem vê o financeiro. */
  cost: ServiceCost | null;
  /** Em andamento e já fora do esperado: custo acima do previsto ou margem abaixo da meta. */
  alert: "over_budget" | "low_margin" | "loss" | null;
}

export function serviceAlert(cost: ServiceCost | null, stage: ServiceStage): ServiceListItem["alert"] {
  if (!cost || stage !== "open" || cost.totalCostCents === 0) return null;
  if (cost.status === "loss") return "loss";
  if (cost.plannedCostCents !== null && cost.totalCostCents > cost.plannedCostCents) return "over_budget";
  if (cost.status === "low") return "low_margin";
  return null;
}

/** Visitas do serviço: feitas, total sem canceladas e a próxima a acontecer a partir de hoje. */
export function summarizeVisits(visits: ServiceVisit[], today: string) {
  const active = visits.filter((visit) => visit.status !== "canceled");
  const upcoming = active
    .filter((visit) => (visit.status === "scheduled" || visit.status === "in_progress") && visit.visit_date >= today)
    .sort((a, b) => `${a.visit_date}${a.starts_at}`.localeCompare(`${b.visit_date}${b.starts_at}`));
  return {
    visitsDone: active.filter((visit) => visit.status === "completed").length,
    visitsTotal: active.length,
    inProgress: active.some((visit) => visit.status === "in_progress"),
    nextVisit: upcoming[0] ?? null,
  };
}

export function createServiceCostService(repo: ServiceCostRepository) {
  async function load(companyId: string, quotes: ServiceQuoteRef[], targetMarginPercent: number) {
    const ids = quotes.map((quote) => quote.id);
    if (ids.length === 0) return new Map<string, ServiceCost>();
    const [expenses, labor] = await Promise.all([repo.listExpenses(companyId, ids), repo.listLabor(companyId, ids)]);
    const rates = await repo.listRates(companyId, [...new Set(labor.map((entry) => entry.employee_id))]);
    return new Map(
      quotes.map((quote) => [
        quote.id,
        buildServiceCost({
          revenueCents: quote.totalCents,
          plannedCostCents: quote.plannedCostCents,
          expenses: expenses.filter((expense) => expense.quote_id === quote.id),
          labor: labor.filter((entry) => entry.quote_id === quote.id),
          rates,
          targetMarginPercent,
        }),
      ]),
    );
  }

  function requireFinance(actor: ActorContext) {
    if (!permissionService.canManageFinance(actor.role)) {
      throw new AppError("forbidden", "Só o proprietário e o administrador veem custos e resultado");
    }
  }

  return {
    /** Serviços em andamento (aprovados) ou concluídos (fechados). Custos só para owner e admin. */
    async listServices(actor: ActorContext, stage: ServiceStage, today: string, targetMarginPercent: number): Promise<ServiceListItem[]> {
      if (!permissionService.canManageSchedule(actor.role)) {
        throw new AppError("forbidden", "Sem permissão para ver os serviços");
      }
      const quotes = await repo.listServiceQuotes(actor.companyId, stage);
      const ids = quotes.map((quote) => quote.id);
      if (ids.length === 0) return [];
      const seesMoney = permissionService.canManageFinance(actor.role);
      const [visits, planned] = await Promise.all([
        repo.listServiceVisits(actor.companyId, ids),
        seesMoney ? repo.listPlannedLines(actor.companyId, ids) : Promise.resolve([]),
      ]);
      const costs = seesMoney
        ? await load(
            actor.companyId,
            quotes.map((quote) => {
              const lines = planned.filter((line) => line.quote_id === quote.id);
              return {
                id: quote.id,
                totalCents: quote.total_cents,
                plannedCostCents: lines.some((line) => line.costCents !== null) ? estimatedCostCents(lines) : null,
              };
            }),
            targetMarginPercent,
          )
        : null;
      return quotes.map((quote) => {
        const cost = costs?.get(quote.id) ?? null;
        return {
          quote,
          ...summarizeVisits(visits.filter((visit) => visit.quote_id === quote.id), today),
          cost,
          alert: serviceAlert(cost, stage),
        };
      });
    },

    /** Orçamentos aprovados ou fechados, para ligar um gasto. */
    async listQuoteOptions(actor: ActorContext) {
      requireFinance(actor);
      return repo.listQuoteOptions(actor.companyId);
    },

    async getForQuote(actor: ActorContext, quote: ServiceQuoteRef, targetMarginPercent: number): Promise<ServiceCost> {
      requireFinance(actor);
      return (await load(actor.companyId, [quote], targetMarginPercent)).get(quote.id)!;
    },

    async getForQuotes(actor: ActorContext, quotes: ServiceQuoteRef[], targetMarginPercent: number) {
      requireFinance(actor);
      return load(actor.companyId, quotes, targetMarginPercent);
    },
  };
}

export type ServiceCostService = ReturnType<typeof createServiceCostService>;
