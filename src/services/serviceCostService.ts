import { AppError } from "@/lib/errors";
import { estimatedCostCents, marginPercent } from "@/lib/quoteCalc";
import { MAX_TAX_RATE_BPS, taxCents } from "@/lib/tax";
import type { ActorContext } from "@/server/actor";
import type { Expense, QuotePaymentPlan } from "@/types/finance";
import { totalsByCategory, type CategoryTotal } from "./expenseService";
import { permissionService } from "./permissionService";

/**
 * Custos e resultado de um serviço (orçamento aprovado ou fechado). Os gastos são os mesmos do
 * caixa, ligados ao orçamento; a mão de obra vem das horas das visitas do orçamento. A hora do CLT
 * já sai no salário do mês: aqui ela é custo apropriado ao serviço, não uma saída a mais. O imposto
 * é estimado pela alíquota do serviço; a guia paga de verdade entra no caixa como gasto "Impostos".
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
  payment_plan?: QuotePaymentPlan | null;
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

export interface QuoteTaxRate {
  quote_id: string;
  /** Congelada na aprovação ou ajustada pelo dono; null segue a da empresa. */
  tax_rate_bps: number | null;
}

export interface ServiceCostRepository {
  listQuoteOptions(companyId: string): Promise<ServiceQuoteOption[]>;
  listServiceQuotes(companyId: string, stage: ServiceStage): Promise<ServiceQuoteRow[]>;
  listServiceVisits(companyId: string, quoteIds: string[]): Promise<ServiceVisit[]>;
  listPlannedLines(companyId: string, quoteIds: string[]): Promise<PlannedLine[]>;
  listExpenses(companyId: string, quoteIds: string[]): Promise<Expense[]>;
  listLabor(companyId: string, quoteIds: string[]): Promise<LaborEntry[]>;
  listRates(companyId: string, employeeIds: string[]): Promise<LaborRate[]>;
  listTaxRates(companyId: string, quoteIds: string[]): Promise<QuoteTaxRate[]>;
  /** Alíquota padrão da empresa; null sem regime informado. */
  getCompanyTaxRate(companyId: string): Promise<number | null>;
  setTaxRate(companyId: string, quoteId: string, rateBps: number): Promise<void>;
  /** Taxa da maquininha das parcelas de cada serviço. */
  listCardFees(companyId: string, quoteIds: string[]): Promise<{ quote_id: string; fee_cents: number }[]>;
}

export type MarginStatus = "good" | "low" | "loss" | "none";

export interface LaborLine {
  employeeId: string;
  name: string;
  minutes: number;
  rateCents: number;
  costCents: number;
}

/** De onde veio a alíquota: do próprio serviço, do padrão atual da empresa, ou não informada. */
export type TaxSource = "service" | "company" | "none";

export interface ServiceCost {
  revenueCents: number;
  expenseCents: number;
  laborCents: number;
  /** Gastos e horas. O imposto fica à parte: o previsto no orçamento não o inclui. */
  totalCostCents: number;
  taxRateBps: number;
  taxCents: number;
  taxSource: TaxSource;
  /** Taxa da maquininha das parcelas no cartão. */
  cardFeeCents: number;
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
  /** Alíquota do serviço; null quando segue a da empresa. */
  serviceTaxRateBps?: number | null;
  companyTaxRateBps?: number | null;
  cardFeeCents?: number;
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
  const serviceRate = input.serviceTaxRateBps ?? null;
  const companyRate = input.companyTaxRateBps ?? null;
  const taxSource: TaxSource = serviceRate !== null ? "service" : companyRate !== null ? "company" : "none";
  const taxRateBps = serviceRate ?? companyRate ?? 0;
  const tax = taxCents(input.revenueCents, taxRateBps);
  const cardFeeCents = Math.max(0, input.cardFeeCents ?? 0);
  const resultCents = input.revenueCents - totalCostCents - tax - cardFeeCents;
  const margin = marginPercent(input.revenueCents, totalCostCents + tax + cardFeeCents);
  const categories = totalsByCategory(input.expenses);
  if (laborCents > 0) categories.push({ categoryId: "labor", name: "Mão de obra (horas)", totalCents: laborCents });
  if (tax > 0) categories.push({ categoryId: "tax", name: "Imposto (estimado)", totalCents: tax });
  if (cardFeeCents > 0) categories.push({ categoryId: "card_fee", name: "Taxa do cartão", totalCents: cardFeeCents });
  categories.sort((a, b) => b.totalCents - a.totalCents);

  return {
    revenueCents: input.revenueCents,
    expenseCents,
    laborCents,
    totalCostCents,
    taxRateBps,
    taxCents: tax,
    taxSource,
    cardFeeCents,
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
    const [expenses, labor, taxRates, companyTaxRateBps, cardFees] = await Promise.all([
      repo.listExpenses(companyId, ids),
      repo.listLabor(companyId, ids),
      repo.listTaxRates(companyId, ids),
      repo.getCompanyTaxRate(companyId),
      repo.listCardFees(companyId, ids),
    ]);
    const rates = await repo.listRates(companyId, [...new Set(labor.map((entry) => entry.employee_id))]);
    const serviceTaxRates = new Map(taxRates.map((row) => [row.quote_id, row.tax_rate_bps]));
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
          serviceTaxRateBps: serviceTaxRates.get(quote.id) ?? null,
          companyTaxRateBps,
          cardFeeCents: cardFees.filter((fee) => fee.quote_id === quote.id).reduce((sum, fee) => sum + fee.fee_cents, 0),
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

    /** Alíquota deste serviço, no lugar do padrão da empresa. O banco confere a empresa e a situação. */
    async setTaxRate(actor: ActorContext, quoteId: string, rateBps: number) {
      requireFinance(actor);
      if (!Number.isInteger(rateBps) || rateBps < 0 || rateBps > MAX_TAX_RATE_BPS) {
        throw new AppError("validation_error", "Informe a alíquota de 0 a 40%, com até duas casas.");
      }
      await repo.setTaxRate(actor.companyId, quoteId, rateBps);
    },
  };
}

export type ServiceCostService = ReturnType<typeof createServiceCostService>;
