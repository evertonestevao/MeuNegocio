import { describe, expect, it } from "vitest";
import { estimatedCostCents, lineTotalCents, marginPercent, subtotalCents, totalCents, priceWithMarkup } from "./quoteCalc";

const fixed = (quantity: number, unitPriceCents: number) =>
  ({ pricingMode: "fixed", quantity, people: 1, unitPriceCents }) as const;
const hourly = (quantity: number, people: number, unitPriceCents: number) =>
  ({ pricingMode: "hourly", quantity, people, unitPriceCents }) as const;

describe("cálculo do orçamento", () => {
  it("preço fechado é quantidade × preço", () => {
    expect(lineTotalCents(fixed(70, 1490))).toBe(104300);
  });

  it("por hora é horas × pessoas × valor, como no protótipo", () => {
    expect(lineTotalCents(hourly(28, 2, 9500))).toBe(532000);
  });

  it("por hora conta no mínimo 1 pessoa", () => {
    expect(lineTotalCents(hourly(2, 0, 1000))).toBe(2000);
  });

  it("preço fechado ignora pessoas", () => {
    expect(lineTotalCents({ ...fixed(2, 1000), people: 5 })).toBe(2000);
  });

  it("arredonda só no fim da linha", () => {
    expect(lineTotalCents(fixed(1.5, 333))).toBe(500);
    expect(subtotalCents([fixed(0.5, 333), fixed(0.5, 333)])).toBe(334);
  });

  it("total desconta e nunca fica negativo", () => {
    expect(totalCents([fixed(1, 1000)], 300)).toBe(700);
    expect(totalCents([fixed(1, 1000)], 5000)).toBe(0);
    expect(totalCents([fixed(1, 1000)], -50)).toBe(1000);
  });

  it("custo considera só os itens com custo", () => {
    expect(
      estimatedCostCents([
        { pricingMode: "fixed", quantity: 2, people: 1, costCents: 100 },
        { pricingMode: "hourly", quantity: 2, people: 3, costCents: 500 },
        { pricingMode: "fixed", quantity: 9, people: 1, costCents: null },
      ]),
    ).toBe(3200);
  });

  it("margem sobre o preço", () => {
    expect(marginPercent(1000, 600)).toBe(40);
    expect(marginPercent(0, 600)).toBeNull();
  });
});

describe("priceWithMarkup", () => {
  it("aplica o acréscimo em % sobre o custo ou em reais por unidade", () => {
    expect(priceWithMarkup(850_000, 20, "percent")).toBe(1_020_000);
    expect(priceWithMarkup(850_000, 150_000, "amount")).toBe(1_000_000);
    expect(priceWithMarkup(999, 12.5, "percent")).toBe(1124);
    expect(priceWithMarkup(1_000, -200, "percent")).toBe(0);
  });
});
