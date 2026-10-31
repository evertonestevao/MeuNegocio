import { describe, expect, it } from "vitest";
import { annualSavingsCents, planMonthlyCents, planOfferLines, plansForSale } from "./planFeatures";

describe("oferta do plano", () => {
  it("mostra limites e omite recurso que o plano não tem", () => {
    expect(
      planOfferLines({ max_members: 2, max_clients: 30, max_quotes_month: 1, public_approval: false, work_orders: true, hours: false, audit_retention_days: 7 }),
    ).toEqual(["Até 2 membros inclusos", "Até 30 clientes", "Até 1 orçamento por mês", "Ordem de serviço"]);
  });

  it("limite vazio é ilimitado", () => {
    expect(planOfferLines({ max_clients: null })).toContain("Clientes ilimitados");
  });
});

describe("preços do anual e do mensal", () => {
  const annual = { price_cents: 395880, billing_interval: "year" as const };
  const monthly = { price_cents: 37990, billing_interval: "month" as const };
  const free = { price_cents: 0, billing_interval: "month" as const };

  it("o anual custa R$ 329,90 por mês", () => {
    expect(planMonthlyCents(annual)).toBe(32990);
    expect(planMonthlyCents(monthly)).toBe(37990);
    expect(planMonthlyCents(annual, 23880)).toBe(1990);
  });

  it("calcula a economia em um ano", () => {
    expect(annualSavingsCents([monthly, annual, free])).toBe(60000);
    expect(annualSavingsCents([monthly, free])).toBe(0);
    expect(annualSavingsCents([{ price_cents: 30000, billing_interval: "month" }, annual])).toBe(0);
  });

  it("vende só os pagos, com o anual primeiro", () => {
    expect(plansForSale([free, monthly, annual])).toEqual([annual, monthly]);
  });
});
