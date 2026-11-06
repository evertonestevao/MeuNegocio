import { describe, expect, it } from "vitest";
import { centsToWords, numberToWords } from "./extenso";

describe("valor por extenso", () => {
  it("números do dia a dia", () => {
    expect(numberToWords(1)).toBe("um");
    expect(numberToWords(16)).toBe("dezesseis");
    expect(numberToWords(21)).toBe("vinte e um");
    expect(numberToWords(100)).toBe("cem");
    expect(numberToWords(101)).toBe("cento e um");
    expect(numberToWords(999)).toBe("novecentos e noventa e nove");
    expect(numberToWords(1_000)).toBe("mil");
    expect(numberToWords(1_100)).toBe("mil e cem");
    expect(numberToWords(1_020)).toBe("mil e vinte");
    expect(numberToWords(1_234)).toBe("mil, duzentos e trinta e quatro");
    expect(numberToWords(2_310)).toBe("dois mil, trezentos e dez");
    expect(numberToWords(1_000_500)).toBe("um milhão e quinhentos");
  });

  it("reais e centavos, como no recibo", () => {
    expect(centsToWords(500_000)).toBe("cinco mil reais");
    expect(centsToWords(123_450)).toBe("mil, duzentos e trinta e quatro reais e cinquenta centavos");
    expect(centsToWords(100)).toBe("um real");
    expect(centsToWords(1)).toBe("um centavo");
    expect(centsToWords(390_865)).toBe("três mil, novecentos e oito reais e sessenta e cinco centavos");
    expect(centsToWords(100_000_000)).toBe("um milhão de reais");
  });
});
