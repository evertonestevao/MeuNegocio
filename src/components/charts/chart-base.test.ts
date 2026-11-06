import { describe, expect, it } from "vitest";
import { allZero, autoYAxisWidth, resolveFormatter } from "./chart-base";

const money = resolveFormatter(undefined, { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 });
const series = [{ key: "faturado" }, { key: "gastos" }];

describe("eixo Y", () => {
  it("cabe o maior rótulo, com folga para o valor arredondado do eixo", () => {
    // "R$ 16,4 mil" tem 11 caracteres: o eixo mostra "R$ 13,5 mil", do mesmo tamanho.
    const width = autoYAxisWidth([{ faturado: 16_400, gastos: 5_000 }], series, money);
    expect(width).toBeGreaterThanOrEqual(16 + 11 * 7);
  });

  it("contagem pequena fica estreita", () => {
    expect(autoYAxisWidth([{ faturado: 2, gastos: 0 }], series, String)).toBe(32);
  });

  it("reconhece gráfico sem movimento", () => {
    expect(allZero([{ faturado: 0, gastos: 0 }], series)).toBe(true);
    expect(allZero([{ faturado: 0, gastos: 1 }], series)).toBe(false);
  });
});
