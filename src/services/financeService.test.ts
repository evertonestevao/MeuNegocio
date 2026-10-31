import { describe, expect, it, vi } from "vitest";
import type { ActorContext } from "@/server/actor";
import type { QuoteListItem, VisitListItem } from "@/types/database";
import type { Expense, ExpenseTemplate, RevenueListItem } from "@/types/finance";
import { buildFinanceOverview, buildForecast, createFinanceService, percentChange, projectUngeneratedRecurring, type FinanceReaders } from "./financeService";

const OWNER: ActorContext = { companyId: "co", role: "owner" };
const MEMBER: ActorContext = { companyId: "co", role: "member" };
const TECHNICIAN: ActorContext = { companyId: "co", role: "technician" };

const revenue = (competence_date: string, amount_cents: number) => ({ competence_date, amount_cents }) as RevenueListItem;
const expense = (expense_date: string, amount_cents: number, category = "a") =>
  ({ expense_date, amount_cents, category_id: category, category_name: category.toUpperCase() }) as Expense;

function makeReaders() {
  return {
    listRevenues: vi.fn(async (): Promise<RevenueListItem[]> => []),
    listExpenses: vi.fn<FinanceReaders["listExpenses"]>(async () => []),
    listExpenseTemplates: vi.fn<FinanceReaders["listExpenseTemplates"]>(async () => []),
    listOpenQuotes: vi.fn(async (): Promise<QuoteListItem[]> => []),
    listVisits: vi.fn(async (): Promise<VisitListItem[]> => []),
  } satisfies FinanceReaders;
}

describe("financeiro", () => {
  it("saldo é faturamento menos gastos do mês", () => {
    const overview = buildFinanceOverview({
      month: "2026-10-01",
      revenues: [revenue("2026-10-05", 1000), revenue("2026-09-05", 500)],
      expenses: [expense("2026-10-02", 300), expense("2026-09-02", 100)],
      openQuotes: [],
    });
    expect(overview.revenueCents).toBe(1000);
    expect(overview.expenseCents).toBe(300);
    expect(overview.balanceCents).toBe(700);
    expect(overview.revenueChange).toBe(100);
    expect(overview.expenseChange).toBe(200);
  });

  it("saldo pode ficar negativo", () => {
    const overview = buildFinanceOverview({ month: "2026-10-01", revenues: [], expenses: [expense("2026-10-02", 300)], openQuotes: [] });
    expect(overview.balanceCents).toBe(-300);
  });

  it("a previsão não entra no saldo", () => {
    const overview = buildFinanceOverview({
      month: "2026-10-01",
      revenues: [],
      expenses: [],
      openQuotes: [
        { status: "sent", total_cents: 500 },
        { status: "approved", total_cents: 700 },
      ],
    });
    expect(overview.balanceCents).toBe(0);
    expect(overview.forecast).toEqual({ approvedCents: 700, sentCents: 500, possibleCents: 1200 });
  });

  it("série cobre 6 meses, terminando no mês escolhido", () => {
    const { series } = buildFinanceOverview({ month: "2026-02-01", revenues: [revenue("2025-09-15", 10)], expenses: [], openQuotes: [] });
    expect(series.map((item) => item.month)).toEqual(["2025-09-01", "2025-10-01", "2025-11-01", "2025-12-01", "2026-01-01", "2026-02-01"]);
    expect(series[0].revenueCents).toBe(10);
  });

  it("categorias só do mês, da maior para a menor", () => {
    const { categories } = buildFinanceOverview({
      month: "2026-10-01",
      revenues: [],
      expenses: [expense("2026-10-01", 100, "a"), expense("2026-10-02", 900, "b"), expense("2026-09-02", 5000, "c")],
      openQuotes: [],
    });
    expect(categories.map((item) => item.name)).toEqual(["B", "A"]);
  });

  it("variação sem base não é calculada", () => {
    expect(percentChange(100, 0)).toBeNull();
    expect(percentChange(50, 100)).toBe(-50);
  });

  it("previsão ignora outros status", () => {
    expect(buildForecast([{ status: "closed", total_cents: 999 }]).possibleCents).toBe(0);
  });

  it("member e técnico não recebem o financeiro", async () => {
    const readers = makeReaders();
    const service = createFinanceService(readers);
    await expect(service.getOverview(MEMBER, "2026-10-01")).rejects.toMatchObject({ code: "forbidden" });
    await expect(service.getOverview(TECHNICIAN, "2026-10-01")).rejects.toMatchObject({ code: "forbidden" });
    expect(readers.listRevenues).not.toHaveBeenCalled();
  });
});

describe("início", () => {
  it("member não busca saldo nem gastos", async () => {
    const readers = makeReaders();
    const home = await createFinanceService(readers).getHome(MEMBER, "2026-10-31");
    expect(home.finance).toBeNull();
    expect(readers.listRevenues).not.toHaveBeenCalled();
    expect(readers.listExpenses).not.toHaveBeenCalled();
  });

  it("técnico não usa o início do escritório", async () => {
    await expect(createFinanceService(makeReaders()).getHome(TECHNICIAN, "2026-10-31")).rejects.toMatchObject({ code: "forbidden" });
  });

  it("separa hoje e amanhã e ignora canceladas", async () => {
    const readers = makeReaders();
    readers.listVisits.mockResolvedValue([
      { id: "a", visit_date: "2026-10-31", status: "scheduled" },
      { id: "b", visit_date: "2026-11-01", status: "scheduled" },
      { id: "c", visit_date: "2026-10-31", status: "canceled" },
    ] as VisitListItem[]);
    const home = await createFinanceService(readers).getHome(OWNER, "2026-10-31");
    expect(home.today.map((visit) => visit.id)).toEqual(["a"]);
    expect(home.tomorrow.map((visit) => visit.id)).toEqual(["b"]);
  });

  it("owner vê saldo do mês e contas dos próximos 7 dias", async () => {
    const readers = makeReaders();
    readers.listRevenues.mockResolvedValue([revenue("2026-10-05", 1000)]);
    readers.listExpenses.mockImplementation(async (_company, from) =>
      from === "2026-10-01"
        ? [expense("2026-10-02", 300)]
        : [expense("2026-10-31", 40), expense("2026-11-03", 60)],
    );
    const { finance } = await createFinanceService(readers).getHome(OWNER, "2026-10-31");
    expect(finance?.balanceCents).toBe(700);
    expect(finance?.dueSoonCents).toBe(100);
    expect(finance?.dueSoonCount).toBe(2);
    expect(finance?.dueToday).toHaveLength(1);
    expect(readers.listExpenses).toHaveBeenCalledWith("co", "2026-10-31", "2026-11-07");
  });

  describe("recorrências ainda não geradas", () => {
    const template = (overrides: Partial<ExpenseTemplate>) =>
      ({ amount_cents: 1000, day_of_month: 5, starts_on: "2026-01-01", ends_on: null, active: true, ...overrides }) as ExpenseTemplate;

    it("no fim do mês, soma as contas do início do próximo", async () => {
      const readers = makeReaders();
      readers.listExpenseTemplates.mockResolvedValue([template({ amount_cents: 180000 }), template({ amount_cents: 320000 })]);
      const { finance } = await createFinanceService(readers).getHome(OWNER, "2026-10-31");
      expect(finance?.dueSoonCents).toBe(500000);
      expect(finance?.dueSoonCount).toBe(2);
      expect(finance?.dueToday).toEqual([]);
    });

    it("no meio do mês não projeta: o mês atual já foi gerado e excluir não pode voltar", () => {
      expect(projectUngeneratedRecurring([template({})], "2026-10-10", "2026-10-17")).toEqual([]);
    });

    it("ignora vencimento depois do prazo", () => {
      expect(projectUngeneratedRecurring([template({ day_of_month: 8 })], "2026-10-31", "2026-11-07")).toEqual([]);
      expect(projectUngeneratedRecurring([template({ day_of_month: 7 })], "2026-10-31", "2026-11-07")).toHaveLength(1);
    });

    it("segue a vigência da geração", () => {
      const project = (overrides: Partial<ExpenseTemplate>) =>
        projectUngeneratedRecurring([template(overrides)], "2026-10-31", "2026-11-07");
      expect(project({ active: false })).toEqual([]);
      expect(project({ starts_on: "2026-12-01" })).toEqual([]);
      expect(project({ ends_on: "2026-10-31" })).toEqual([]);
      // Vigência é por mês, como no banco: vale o mês inteiro de início e de fim.
      expect(project({ starts_on: "2026-11-20" })).toHaveLength(1);
      expect(project({ ends_on: "2026-11-02" })).toHaveLength(1);
    });
  });

  it("separa orçamentos aguardando resposta dos aprovados por fechar", async () => {
    const readers = makeReaders();
    readers.listOpenQuotes.mockResolvedValue([
      { id: "s", status: "sent", total_cents: 1 },
      { id: "a", status: "approved", total_cents: 2 },
    ] as QuoteListItem[]);
    const home = await createFinanceService(readers).getHome(MEMBER, "2026-10-31");
    expect(home.awaitingReply.map((quote) => quote.id)).toEqual(["s"]);
    expect(home.awaitingClose.map((quote) => quote.id)).toEqual(["a"]);
  });
});
