import { describe, expect, it } from "vitest";
import { clientUnitPriceCents } from "./use-quote-editor";

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
