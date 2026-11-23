import { describe, expect, it } from "vitest";
import { buildPayableInstallments, currentPayablePlan, installmentsLocked, outflowDate, payableStatus, paymentSummary, summarizePayables } from "./payables";

const item = (due_date: string, paid_on: string | null, amount_cents = 1000) => ({ due_date, paid_on, amount_cents });

describe("parcelas de um gasto (contas a pagar)", () => {
  it("R$ 3.000 em 3 vezes, a 1ª em 10/12: uma por mês, no mesmo dia", () => {
    expect(buildPayableInstallments(300000, { mode: "pending", paidOn: "", count: 3, firstDueDate: "2026-12-10" })).toEqual([
      { due_date: "2026-12-10", amount_cents: 100000, paid_on: null },
      { due_date: "2027-01-10", amount_cents: 100000, paid_on: null },
      { due_date: "2027-02-10", amount_cents: 100000, paid_on: null },
    ]);
  });

  it("os centavos que sobram vão na 1ª, e as parcelas somam o total", () => {
    const parts = buildPayableInstallments(100000, { mode: "pending", paidOn: "", count: 3, firstDueDate: "2026-12-31" });
    expect(parts.map((part) => part.amount_cents)).toEqual([33334, 33333, 33333]);
    // Mês mais curto: o último dia dele.
    expect(parts.map((part) => part.due_date)).toEqual(["2026-12-31", "2027-01-31", "2027-02-28"]);
  });

  it("já pago: uma parcela, paga na data", () => {
    expect(buildPayableInstallments(5000, { mode: "paid", paidOn: "2026-10-20", count: 1, firstDueDate: "" })).toEqual([
      { due_date: "2026-10-20", amount_cents: 5000, paid_on: "2026-10-20" },
    ]);
  });

  it("ao abrir o gasto, mostra como ele está hoje", () => {
    expect(currentPayablePlan([], "2026-11-20", "2026-11-23")).toMatchObject({ mode: "paid", paidOn: "2026-11-20" });
    expect(currentPayablePlan([], "2026-11-30", "2026-11-23")).toMatchObject({ mode: "pending", count: 1, firstDueDate: "2026-11-30" });
    expect(currentPayablePlan([item("2026-10-20", "2026-10-21")], "2026-10-01", "2026-11-23")).toMatchObject({ mode: "paid", paidOn: "2026-10-21" });
    expect(currentPayablePlan([item("2027-01-10", null), item("2026-12-10", null)], "2026-12-01", "2026-11-23")).toMatchObject({
      mode: "pending",
      count: 2,
      firstDueDate: "2026-12-10",
    });
  });

  it("trava valor e parcelas só quando há mais de uma parcela e alguma paga", () => {
    expect(installmentsLocked([item("2026-12-10", "2026-12-10"), item("2027-01-10", null)])).toBe(true);
    expect(installmentsLocked([item("2026-12-10", null), item("2027-01-10", null)])).toBe(false);
    expect(installmentsLocked([item("2026-12-10", "2026-12-10")])).toBe(false);
  });

  it("situação: paga, atrasada, vence hoje ou em aberto", () => {
    expect(payableStatus(item("2026-11-01", "2026-11-02"), "2026-11-23")).toBe("paid");
    expect(payableStatus(item("2026-11-22", null), "2026-11-23")).toBe("overdue");
    expect(payableStatus(item("2026-11-23", null), "2026-11-23")).toBe("due_today");
    expect(payableStatus(item("2026-11-24", null), "2026-11-23")).toBe("open");
    expect(outflowDate(item("2026-11-10", "2026-11-12"))).toBe("2026-11-12");
    expect(outflowDate(item("2026-11-10", null))).toBe("2026-11-10");
  });

  it("totais do que falta pagar", () => {
    const totals = summarizePayables([item("2026-11-20", null, 100), item("2026-11-25", null, 200), item("2026-12-20", null, 400), item("2026-11-24", "2026-11-23", 800)], "2026-11-23");
    expect(totals).toEqual({ openCents: 700, openCount: 3, overdueCents: 100, overdueCount: 1, dueSoonCents: 200, dueSoonCount: 1 });
  });

  it("resumo do pagamento na lista de gastos", () => {
    expect(paymentSummary([item("2026-11-20", "2026-11-20")])).toMatchObject({ label: "Pago", settled: true });
    expect(paymentSummary([item("2026-12-10", null)])).toMatchObject({ label: "A pagar", settled: false, nextDue: "2026-12-10" });
    expect(paymentSummary([item("2026-12-10", "2026-12-10"), item("2027-01-10", null), item("2027-02-10", null)])).toMatchObject({
      label: "1 de 3 parcelas pagas",
      nextDue: "2027-01-10",
    });
    expect(paymentSummary([item("2026-12-10", "2026-12-10"), item("2027-01-10", "2027-01-10")])).toMatchObject({ label: "2 parcelas pagas", settled: true });
  });
});
