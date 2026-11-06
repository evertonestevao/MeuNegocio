import { describe, expect, it, vi } from "vitest";
import type { ActorContext } from "@/server/actor";
import type { Expense } from "@/types/finance";
import { buildServiceCost, createServiceCostService, laborRateCents, marginStatus, serviceAlert, type LaborEntry, type ServiceCost, type ServiceVisit } from "./serviceCostService";

const OWNER: ActorContext = { companyId: "co", role: "owner" };
const expense = (amount_cents: number, category = "mat", quote_id = "q1") =>
  ({ id: `${category}-${amount_cents}`, amount_cents, category_id: category, category_name: category.toUpperCase(), quote_id, kind: "one_off" }) as Expense;
const labor = (employee_id: string, minutes: number, quote_id = "q1"): LaborEntry => ({ quote_id, employee_id, employee_name: employee_id, minutes });

describe("resultado do serviço", () => {
  it("desconta gastos e horas do valor cobrado e calcula a margem", () => {
    const cost = buildServiceCost({
      revenueCents: 100_000,
      plannedCostCents: 50_000,
      expenses: [expense(30_000), expense(10_000, "comb")],
      labor: [labor("ana", 120), labor("ana", 60), labor("bia", 90)],
      rates: [
        { employee_id: "ana", hourly_cost_cents: 4_000, hourly_pay_cents: 0 },
        { employee_id: "bia", hourly_cost_cents: 0, hourly_pay_cents: 6_000 },
      ],
      targetMarginPercent: 20,
    });
    expect(cost.expenseCents).toBe(40_000);
    expect(cost.labor.find((line) => line.employeeId === "ana")).toMatchObject({ minutes: 180, costCents: 12_000 });
    expect(cost.labor.find((line) => line.employeeId === "bia")).toMatchObject({ minutes: 90, rateCents: 6_000, costCents: 9_000 });
    expect(cost.laborCents).toBe(21_000);
    expect(cost.resultCents).toBe(39_000);
    expect(cost.marginPercent).toBe(39);
    expect(cost.plannedMarginPercent).toBe(50);
    expect(cost.status).toBe("good");
    expect(cost.categories.map((category) => category.name)).toEqual(["MAT", "Mão de obra (horas)", "COMB"]);
    expect(cost.laborWithoutRate).toBe(false);
  });

  it("desconta o imposto do serviço, ou o padrão da empresa quando o serviço não tem", () => {
    const base = { revenueCents: 100_000, plannedCostCents: null, expenses: [expense(40_000)], labor: [], rates: [], targetMarginPercent: 20 };
    const own = buildServiceCost({ ...base, serviceTaxRateBps: 843, companyTaxRateBps: 600 });
    expect(own).toMatchObject({ taxSource: "service", taxRateBps: 843, taxCents: 8_430, totalCostCents: 40_000, resultCents: 51_570, marginPercent: 52 });
    expect(buildServiceCost({ ...base, serviceTaxRateBps: null, companyTaxRateBps: 600 })).toMatchObject({ taxSource: "company", taxCents: 6_000, resultCents: 54_000 });
    // Alíquota zero gravada no serviço (MEI) vale mais que o padrão da empresa.
    expect(buildServiceCost({ ...base, serviceTaxRateBps: 0, companyTaxRateBps: 600 })).toMatchObject({ taxSource: "service", taxCents: 0 });
    expect(buildServiceCost(base)).toMatchObject({ taxSource: "none", taxCents: 0, resultCents: 60_000 });
  });

  it("a taxa do cartão é custo do serviço", () => {
    const cost = buildServiceCost({ revenueCents: 100_000, plannedCostCents: null, expenses: [expense(40_000)], labor: [], rates: [], targetMarginPercent: 20, cardFeeCents: 3_490 });
    expect(cost).toMatchObject({ cardFeeCents: 3_490, resultCents: 56_510, marginPercent: 57, totalCostCents: 40_000 });
    expect(cost.categories.map((category) => category.name)).toContain("Taxa do cartão");
  });

  it("o imposto pode levar a margem para baixo da meta", () => {
    const cost = buildServiceCost({ revenueCents: 10_000, plannedCostCents: null, expenses: [expense(7_500)], labor: [], rates: [], targetMarginPercent: 20, companyTaxRateBps: 600 });
    expect(cost.resultCents).toBe(1_900);
    expect(cost.status).toBe("low");
  });

  it("aponta prejuízo, margem abaixo da meta e horas sem custo cadastrado", () => {
    expect(marginStatus(-1, -5, 20)).toBe("loss");
    expect(marginStatus(100, 10, 20)).toBe("low");
    expect(marginStatus(100, 20, 20)).toBe("good");
    expect(marginStatus(0, null, 20)).toBe("none");
    const cost = buildServiceCost({ revenueCents: 1_000, plannedCostCents: null, expenses: [], labor: [labor("ana", 60)], rates: [], targetMarginPercent: 20 });
    expect(cost.laborWithoutRate).toBe(true);
    expect(cost.laborCents).toBe(0);
  });

  it("custo por hora: o cadastrado, senão o pago ao prestador", () => {
    expect(laborRateCents({ employee_id: "a", hourly_cost_cents: 3_000, hourly_pay_cents: 5_000 })).toBe(3_000);
    expect(laborRateCents({ employee_id: "a", hourly_cost_cents: 0, hourly_pay_cents: 5_000 })).toBe(5_000);
    expect(laborRateCents(undefined)).toBe(0);
  });
});

describe("serviço de custos", () => {
  function setup() {
    const repo = {
      listQuoteOptions: vi.fn(async () => []),
      listServiceQuotes: vi.fn(async () => [
        { id: "q1", number: 1, title: "A", client_name: "C", total_cents: 1_000, approved_at: null, closed_at: null },
      ]),
      listServiceVisits: vi.fn(async (): Promise<ServiceVisit[]> => [
        { quote_id: "q1", visit_date: "2026-11-01", starts_at: "08:00", status: "completed" },
        { quote_id: "q1", visit_date: "2026-11-05", starts_at: "13:00", status: "scheduled" },
        { quote_id: "q1", visit_date: "2026-11-04", starts_at: "08:00", status: "scheduled" },
        { quote_id: "q1", visit_date: "2026-11-02", starts_at: "08:00", status: "canceled" },
      ]),
      listPlannedLines: vi.fn(async () => [{ quote_id: "q1", pricingMode: "fixed" as const, quantity: 1, people: 1, costCents: 300 }]),
      listExpenses: vi.fn(async () => [expense(500, "mat", "q1"), expense(700, "mat", "q2")]),
      listLabor: vi.fn(async () => [labor("ana", 60, "q2")]),
      listRates: vi.fn(async () => [{ employee_id: "ana", hourly_cost_cents: 1_000, hourly_pay_cents: 0 }]),
      listTaxRates: vi.fn(async () => [{ quote_id: "q2", tax_rate_bps: 1_000 }]),
      getCompanyTaxRate: vi.fn(async (): Promise<number | null> => 600),
      setTaxRate: vi.fn(async () => undefined),
      listCardFees: vi.fn(async () => [{ quote_id: "q1", fee_cents: 35 }]),
    };
    return { repo, service: createServiceCostService(repo) };
  }

  it("separa os custos de cada serviço", async () => {
    const { service, repo } = setup();
    const results = await service.getForQuotes(OWNER, [{ id: "q1", totalCents: 1_000, plannedCostCents: null }, { id: "q2", totalCents: 1_000, plannedCostCents: null }], 20);
    expect(results.get("q1")?.totalCostCents).toBe(500);
    expect(results.get("q2")?.totalCostCents).toBe(1_700);
    expect(repo.listRates).toHaveBeenCalledWith("co", ["ana"]);
  });

  it("membro e técnico não veem custos nem resultado", async () => {
    for (const role of ["member", "technician"] as const) {
      const { service, repo } = setup();
      await expect(service.getForQuote({ companyId: "co", role }, { id: "q1", totalCents: 1, plannedCostCents: null }, 20)).rejects.toMatchObject({ code: "forbidden" });
      await expect(service.listQuoteOptions({ companyId: "co", role })).rejects.toMatchObject({ code: "forbidden" });
      expect(repo.listExpenses).not.toHaveBeenCalled();
    }
  });

  it("soma a taxa do cartão de cada serviço", async () => {
    const { service } = setup();
    const results = await service.getForQuotes(OWNER, [{ id: "q1", totalCents: 1_000, plannedCostCents: null }, { id: "q2", totalCents: 1_000, plannedCostCents: null }], 20);
    expect(results.get("q1")?.cardFeeCents).toBe(35);
    expect(results.get("q2")?.cardFeeCents).toBe(0);
  });

  it("cada serviço usa a própria alíquota, e quem não tem segue a da empresa", async () => {
    const { service } = setup();
    const results = await service.getForQuotes(OWNER, [{ id: "q1", totalCents: 1_000, plannedCostCents: null }, { id: "q2", totalCents: 1_000, plannedCostCents: null }], 20);
    expect(results.get("q1")).toMatchObject({ taxSource: "company", taxCents: 60 });
    expect(results.get("q2")).toMatchObject({ taxSource: "service", taxCents: 100 });
  });

  it("só owner e admin mudam o imposto do serviço, dentro de 0 a 40%", async () => {
    const { service, repo } = setup();
    await expect(service.setTaxRate({ companyId: "co", role: "member" }, "q1", 600)).rejects.toMatchObject({ code: "forbidden" });
    await expect(service.setTaxRate(OWNER, "q1", 4_001)).rejects.toMatchObject({ code: "validation_error" });
    await expect(service.setTaxRate(OWNER, "q1", 8.5)).rejects.toMatchObject({ code: "validation_error" });
    expect(repo.setTaxRate).not.toHaveBeenCalled();
    await service.setTaxRate({ companyId: "co", role: "admin" }, "q1", 843);
    expect(repo.setTaxRate).toHaveBeenCalledWith("co", "q1", 843);
  });

  it("sem serviços, não consulta o banco", async () => {
    const { service, repo } = setup();
    expect((await service.getForQuotes(OWNER, [], 20)).size).toBe(0);
    expect(repo.listExpenses).not.toHaveBeenCalled();
  });
});

describe("lista de serviços", () => {
  function setup() {
    const repo = {
      listQuoteOptions: vi.fn(async () => []),
      listServiceQuotes: vi.fn(async () => [{ id: "q1", number: 1, title: "A", client_name: "C", total_cents: 1_000, approved_at: null, closed_at: null }]),
      listServiceVisits: vi.fn(async (): Promise<ServiceVisit[]> => [
        { quote_id: "q1", visit_date: "2026-11-01", starts_at: "08:00", status: "completed" },
        { quote_id: "q1", visit_date: "2026-11-05", starts_at: "13:00", status: "scheduled" },
        { quote_id: "q1", visit_date: "2026-11-04", starts_at: "08:00", status: "scheduled" },
        { quote_id: "q1", visit_date: "2026-11-02", starts_at: "08:00", status: "canceled" },
      ]),
      listPlannedLines: vi.fn(async () => [{ quote_id: "q1", pricingMode: "fixed" as const, quantity: 1, people: 1, costCents: 300 }]),
      listExpenses: vi.fn(async () => [expense(400, "mat", "q1")]),
      listLabor: vi.fn(async (): Promise<LaborEntry[]> => []),
      listRates: vi.fn(async () => []),
      listTaxRates: vi.fn(async () => []),
      getCompanyTaxRate: vi.fn(async (): Promise<number | null> => null),
      setTaxRate: vi.fn(async () => undefined),
      listCardFees: vi.fn(async () => []),
    };
    return { repo, service: createServiceCostService(repo) };
  }

  it("resume as visitas e avisa quando o custo passa do previsto", async () => {
    const { service } = setup();
    const [item] = await service.listServices(OWNER, "open", "2026-11-03", 20);
    expect(item).toMatchObject({ visitsDone: 1, visitsTotal: 3, inProgress: false });
    expect(item.nextVisit).toMatchObject({ visit_date: "2026-11-04" });
    expect(item.cost?.plannedCostCents).toBe(300);
    expect(item.alert).toBe("over_budget");
  });

  it("membro vê o andamento, sem custo, margem nem previsto", async () => {
    const { service, repo } = setup();
    const [item] = await service.listServices({ companyId: "co", role: "member" }, "open", "2026-11-03", 20);
    expect(item.cost).toBeNull();
    expect(item.alert).toBeNull();
    expect(repo.listExpenses).not.toHaveBeenCalled();
    expect(repo.listPlannedLines).not.toHaveBeenCalled();
    await expect(service.listServices({ companyId: "co", role: "technician" }, "open", "2026-11-03", 20)).rejects.toMatchObject({ code: "forbidden" });
  });

  it("alerta só serviço em andamento e com custo lançado", () => {
    const base = { totalCostCents: 100, plannedCostCents: null, status: "good" } as ServiceCost;
    expect(serviceAlert({ ...base, status: "loss" }, "open")).toBe("loss");
    expect(serviceAlert({ ...base, status: "low" }, "open")).toBe("low_margin");
    expect(serviceAlert({ ...base, status: "loss" }, "done")).toBeNull();
    expect(serviceAlert({ ...base, totalCostCents: 0, status: "loss" }, "open")).toBeNull();
    expect(serviceAlert(null, "open")).toBeNull();
  });
});
