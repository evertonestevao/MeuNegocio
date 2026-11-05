import { describe, expect, it } from "vitest";
import { addMonthsKeepDay, buildInstallments, defaultPaymentPlan, receivableStatus, splitCents, summarizeOpen } from "./installments";

const TODAY = "2026-11-04";
const plan = (overrides: Partial<ReturnType<typeof defaultPaymentPlan>>) => ({ ...defaultPaymentPlan(TODAY), ...overrides });

describe("parcelas do fechamento", () => {
  it("divide em parcelas iguais e põe os centavos que sobram na primeira", () => {
    expect(splitCents(100_000, 3)).toEqual([33_334, 33_333, 33_333]);
    expect(splitCents(100_000, 1)).toEqual([100_000]);
    expect(splitCents(500, 0)).toEqual([500]);
  });

  it("mantém o dia nos meses seguintes, ou o último dia do mês mais curto", () => {
    expect(addMonthsKeepDay("2026-11-04", 1)).toBe("2026-12-04");
    expect(addMonthsKeepDay("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonthsKeepDay("2026-12-15", 2)).toBe("2027-02-15");
  });

  it("à vista: uma parcela hoje, recebida ou não", () => {
    expect(buildInstallments(150_000, plan({ kind: "cash", method: "cash" }), TODAY)).toEqual([
      { amount_cents: 150_000, due_date: TODAY, method: "cash", received: true },
    ]);
    expect(buildInstallments(150_000, plan({ kind: "cash", method: "boleto", receivedNow: false }), TODAY)[0].received).toBe(false);
  });

  it("entrada + parcelas: a entrada hoje e o restante dividido, mês a mês", () => {
    const rows = buildInstallments(300_000, plan({ kind: "entry", entryCents: 100_000, count: 2, method: "boleto", firstDueDate: "2026-12-04" }), TODAY);
    expect(rows).toEqual([
      { amount_cents: 100_000, due_date: TODAY, method: "pix", received: true },
      { amount_cents: 100_000, due_date: "2026-12-04", method: "boleto", received: false },
      { amount_cents: 100_000, due_date: "2027-01-04", method: "boleto", received: false },
    ]);
    expect(rows.reduce((sum, row) => sum + row.amount_cents, 0)).toBe(300_000);
    // Entrada maior que o total vira à vista; sem entrada, só as parcelas.
    expect(buildInstallments(300_000, plan({ kind: "entry", entryCents: 900_000 }), TODAY)).toHaveLength(1);
    expect(buildInstallments(300_000, plan({ kind: "entry", entryCents: 0, count: 3 }), TODAY)).toHaveLength(3);
  });

  it("cartão em N vezes: parcelas no crédito, a receber, a partir do primeiro repasse", () => {
    const rows = buildInstallments(100_000, plan({ kind: "card", count: 3, firstDueDate: "2026-12-04" }), TODAY);
    expect(rows.map((row) => [row.amount_cents, row.due_date, row.method, row.received])).toEqual([
      [33_334, "2026-12-04", "credit", false],
      [33_333, "2027-01-04", "credit", false],
      [33_333, "2027-02-04", "credit", false],
    ]);
  });

  it("personalizado não gera parcelas sozinho", () => {
    expect(buildInstallments(100_000, plan({ kind: "custom" }), TODAY)).toEqual([]);
  });
});

describe("contas a receber", () => {
  it("situação de cada parcela", () => {
    expect(receivableStatus({ received_on: "2026-11-01", due_date: "2026-10-01" }, TODAY)).toBe("received");
    expect(receivableStatus({ received_on: null, due_date: "2026-11-03" }, TODAY)).toBe("overdue");
    expect(receivableStatus({ received_on: null, due_date: TODAY }, TODAY)).toBe("due_today");
    expect(receivableStatus({ received_on: null, due_date: "2026-11-20" }, TODAY)).toBe("open");
  });

  it("soma o que falta receber, o atrasado e o que vence em 7 dias", () => {
    const totals = summarizeOpen(
      [
        { received_on: null, due_date: "2026-11-01", amount_cents: 100 },
        { received_on: null, due_date: TODAY, amount_cents: 200 },
        { received_on: null, due_date: "2026-11-11", amount_cents: 300 },
        { received_on: null, due_date: "2026-12-30", amount_cents: 400 },
        { received_on: "2026-11-02", due_date: "2026-11-02", amount_cents: 999 },
      ],
      TODAY,
    );
    expect(totals).toEqual({ openCents: 1_000, openCount: 4, overdueCents: 100, overdueCount: 1, dueSoonCents: 500, dueSoonCount: 2 });
  });
});
