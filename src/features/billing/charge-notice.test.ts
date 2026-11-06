import { describe, expect, it } from "vitest";
import { nextChargeNotice } from "./charge-notice";

const base = { status: "trialing" as const, renews: true, cancel_at_period_end: false, current_period_end: "2026-11-13T19:53:01Z", contracted_price_cents: 37_990 };
const text = (value: string | null) => value?.replace(/ /g, " ") ?? null;

describe("próxima cobrança", () => {
  it("no teste com cartão, diz quando e quanto será a primeira cobrança", () => {
    expect(text(nextChargeNotice(base))).toBe("Teste grátis até 13/11/2026. A primeira cobrança, de R$ 379,90, será nessa data. Cancele antes e não paga nada.");
  });

  it("assinatura ativa mostra a data da próxima cobrança", () => {
    expect(nextChargeNotice({ ...base, status: "active" })).toBe("Próxima cobrança em 13/11/2026.");
  });

  it("sem cobrança à frente, não diz nada", () => {
    expect(nextChargeNotice({ ...base, renews: false })).toBeNull();
    expect(nextChargeNotice({ ...base, cancel_at_period_end: true })).toBeNull();
    expect(nextChargeNotice({ ...base, status: "canceled" })).toBeNull();
    expect(nextChargeNotice(null)).toBeNull();
  });
});
