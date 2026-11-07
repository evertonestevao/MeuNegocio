import { describe, expect, it } from "vitest";
import { clientUnitPriceCents, discountInputToCents, percentDiscountCents } from "./use-quote-editor";

describe("preço que o cliente vê", () => {
  it("soma o valor a mais em % ou em R$ ao valor digitado", () => {
    expect(clientUnitPriceCents({ unitPrice: "8.500,00", markup: "20", markupMode: "percent" })).toBe(1_020_000);
    expect(clientUnitPriceCents({ unitPrice: "8.500,00", markup: "1.500,00", markupMode: "amount" })).toBe(1_000_000);
  });

  it("sem valor a mais, é o próprio valor digitado", () => {
    expect(clientUnitPriceCents({ unitPrice: "180,00", markup: "", markupMode: "percent" })).toBe(18_000);
    expect(clientUnitPriceCents({ unitPrice: "180,00", markup: "abc", markupMode: "percent" })).toBe(18_000);
  });
});

describe("desconto digitado", () => {
  it("campo apagado é sem desconto", () => {
    expect(discountInputToCents("")).toBe(0);
    expect(discountInputToCents("  ")).toBe(0);
    expect(discountInputToCents("150,00")).toBe(15_000);
  });

  it("texto que não é valor fica inválido, para o salvar recusar", () => {
    expect(discountInputToCents("abc")).toBe(-1);
  });
});

describe("desconto em %", () => {
  it("vira R$ sobre o subtotal, arredondado ao centavo", () => {
    expect(percentDiscountCents(328_000, "10")).toBe(32_800);
    expect(percentDiscountCents(181_475, "2,5")).toBe(4_537);
    expect(percentDiscountCents(100_000, "")).toBe(0);
  });

  it("acima de 100% passa do subtotal, para o salvar recusar; texto inválido fica -1", () => {
    expect(percentDiscountCents(10_000, "150")).toBe(15_000);
    expect(percentDiscountCents(10_000, "abc")).toBe(-1);
    expect(percentDiscountCents(10_000, "-5")).toBe(-1);
  });
});
