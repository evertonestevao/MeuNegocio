import { describe, expect, it } from "vitest";
import { closeQuoteSchema } from "./schemas";

const row = (amount_cents: number, received = false) => ({ amount_cents, due_date: "2026-11-04", method: "pix" as const, received });

describe("fechamento com parcelas", () => {
  it("aceita parcelas que somam o valor fechado", () => {
    expect(closeQuoteSchema.safeParse({ amountCents: 300, competenceDate: "2026-11-04", installments: [row(100, true), row(200)] }).success).toBe(true);
  });

  it("recusa soma diferente, parcela sem valor e fechamento sem parcelas", () => {
    expect(closeQuoteSchema.safeParse({ amountCents: 300, competenceDate: "2026-11-04", installments: [row(100), row(100)] }).error?.issues[0]?.message).toBe(
      "As parcelas precisam somar o valor fechado.",
    );
    expect(closeQuoteSchema.safeParse({ amountCents: 300, competenceDate: "2026-11-04", installments: [row(300), row(0)] }).success).toBe(false);
    expect(closeQuoteSchema.safeParse({ amountCents: 300, competenceDate: "2026-11-04", installments: [] }).success).toBe(false);
  });
});
