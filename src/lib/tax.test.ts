import { describe, expect, it } from "vitest";
import { formatTaxRate, parseTaxRate, taxCents, taxRateInput } from "./tax";

describe("imposto estimado", () => {
  it("calcula sobre o valor cobrado e arredonda no centavo", () => {
    expect(taxCents(122_600, 843)).toBe(10_335);
    expect(taxCents(0, 843)).toBe(0);
    expect(taxCents(10_000, 0)).toBe(0);
  });

  it("lê e escreve a alíquota no formato brasileiro", () => {
    expect(parseTaxRate("8,43")).toBe(843);
    expect(parseTaxRate(" 6 % ")).toBe(600);
    expect(parseTaxRate("15.5")).toBe(1_550);
    expect(parseTaxRate("8,431")).toBeNull();
    expect(parseTaxRate("abc")).toBeNull();
    expect(parseTaxRate("-1")).toBeNull();
    expect(formatTaxRate(843)).toBe("8,43%");
    expect(formatTaxRate(800)).toBe("8%");
    expect(taxRateInput(1_550)).toBe("15,5");
  });
});
