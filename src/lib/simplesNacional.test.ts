import { describe, expect, it } from "vitest";
import { effectiveAnnex, rbt12Cents, simplesRate } from "./simplesNacional";

// Os mesmos casos do bloco "Simples Nacional pelo RBT12" em supabase/tests/security_regression_test.sql.
describe("Simples Nacional", () => {
  it("alíquota efetiva pela faixa do RBT12", () => {
    expect(simplesRate("III", 30_000_000)).toMatchObject({ bracket: 2, rateBps: 808 });
    expect(simplesRate("III", 28_500_000).rateBps).toBe(792);
    expect(simplesRate("V", 28_500_000).rateBps).toBe(1_642);
    expect(simplesRate("IV", 18_000_000)).toMatchObject({ bracket: 1, rateBps: 450 });
  });

  it("sem faturamento fica na primeira faixa; acima do teto avisa", () => {
    expect(simplesRate("III", 0)).toMatchObject({ bracket: 1, rateBps: 600, overLimit: false });
    expect(simplesRate("III", 500_000_000)).toMatchObject({ bracket: 6, overLimit: true });
  });

  it("RBT12 proporcional com menos de 12 meses de atividade", () => {
    expect(rbt12Cents([2_500_000, 2_500_000, 1_000_000], 3)).toBe(24_000_000);
    expect(simplesRate("III", 24_000_000).rateBps).toBe(730);
    expect(rbt12Cents(Array(12).fill(2_500_000))).toBe(30_000_000);
    expect(rbt12Cents([], 0)).toBe(0);
  });

  it("Fator R leva o Anexo V para o III", () => {
    expect(effectiveAnnex("V", true)).toBe("III");
    expect(effectiveAnnex("V", false)).toBe("V");
    expect(effectiveAnnex("IV", true)).toBe("IV");
  });
});
