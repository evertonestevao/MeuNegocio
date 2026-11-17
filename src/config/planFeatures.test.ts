import { describe, expect, it } from "vitest";
import { CYCLE_CHOICES, cycleSavingsCents, planCycleLabel, planMonthlyCents, planOfferLines, planTermPayments, plansForSale, termCycleLabel, termRenewalLabel } from "./planFeatures";

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
    expect(cycleSavingsCents(annual, [monthly, annual, free])).toBe(60000);
    expect(cycleSavingsCents(monthly, [monthly, free])).toBe(0);
    expect(cycleSavingsCents(annual, [{ price_cents: 30000, billing_interval: "month" }, annual])).toBe(0);
  });

  it("vende só os pagos, com o anual primeiro", () => {
    expect(plansForSale([free, monthly, annual])).toEqual([annual, monthly]);
  });
});

describe("parcelas do ciclo do plano", () => {
  const ciclo = (price_cents: number, term_payments?: number) => ({ price_cents, billing_interval: "year" as const, term_payments });
  const mensal = { price_cents: 37990, billing_interval: "month" as const };

  it("mensal tem 1 cobrança por ciclo; anual usa as parcelas do plano, e 12 quando não diz", () => {
    expect(planTermPayments(mensal)).toBe(1);
    expect(planTermPayments(ciclo(395880))).toBe(12);
    expect(planTermPayments(ciclo(1500, 3))).toBe(3);
    expect(planTermPayments(ciclo(500, 1))).toBe(1);
  });

  it("o valor por mês é o total do ciclo dividido pelas parcelas", () => {
    expect(planMonthlyCents(ciclo(395880))).toBe(32990);
    expect(planMonthlyCents(ciclo(1500, 3))).toBe(500);
    expect(planMonthlyCents(ciclo(500, 1))).toBe(500);
    expect(planMonthlyCents(mensal)).toBe(37990);
  });

  it("o texto do período: mês, ano e ciclo de N meses", () => {
    expect(planCycleLabel(mensal)).toBe("mês");
    expect(planCycleLabel(ciclo(395880))).toBe("ano");
    expect(planCycleLabel(ciclo(1500, 3))).toBe("trimestre");
    expect(planCycleLabel(ciclo(3000, 6))).toBe("semestre");
    expect(planCycleLabel(ciclo(2500, 5))).toBe("ciclo de 5 meses");
    expect(planCycleLabel(ciclo(500, 1))).toBe("mês");
  });

  it("a economia compara com o mensal pelos mesmos meses do ciclo", () => {
    expect(cycleSavingsCents(ciclo(395880), [mensal, ciclo(395880)])).toBe(60000);
    // 6 meses de mensal = 227.940; ciclo de 6 por 200.000 economiza 27.940
    expect(cycleSavingsCents(ciclo(200000, 6), [mensal, ciclo(200000, 6)])).toBe(27940);
  });
});

describe("ciclos prontos e economia por plano", () => {
  const mensal = (price_cents: number) => ({ price_cents, billing_interval: "month" as const });
  const ciclo = (price_cents: number, term_payments: number) => ({ price_cents, billing_interval: "year" as const, term_payments });

  it("nomes do ciclo e de quando renova", () => {
    expect([1, 3, 6, 12, 5].map(termCycleLabel)).toEqual(["mês", "trimestre", "semestre", "ano", "ciclo de 5 meses"]);
    expect([1, 3, 6, 12, 5].map(termRenewalLabel)).toEqual(["todo mês", "a cada trimestre", "a cada semestre", "a cada ano", "a cada 5 meses"]);
  });

  it("a economia é de cada plano e a referência é o mensal pago mais barato", () => {
    const planos = [mensal(98768), mensal(37990), ciclo(100000, 3), ciclo(395880, 12)];
    // trimestral: 3 x 379,90 = 1.139,70 - 1.000,00 = 139,70 (e não 3 x 987,68)
    expect(cycleSavingsCents(planos[2], planos)).toBe(13970);
    expect(cycleSavingsCents(planos[3], planos)).toBe(60000);
    expect(cycleSavingsCents(planos[0], planos)).toBe(0);
  });

  it("sem mensal para comparar, ou mais caro que o mensal, não há economia", () => {
    expect(cycleSavingsCents(ciclo(1500, 3), [ciclo(1500, 3)])).toBe(0);
    expect(cycleSavingsCents(ciclo(200000, 3), [mensal(37990), ciclo(200000, 3)])).toBe(0);
  });

  it("as opções do formulário: mensal, trimestral, semestral, anual e personalizado", () => {
    expect(CYCLE_CHOICES.map((choice) => [choice.value, choice.termPayments])).toEqual([["month", null], ["quarter", 3], ["semester", 6], ["year", 12], ["custom", null]]);
  });
});
