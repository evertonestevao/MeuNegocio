import { describe, expect, it } from "vitest";
import { searchTerms } from "./search";

describe("searchTerms", () => {
  it("tira acento, caixa e espaço sobrando", () => {
    expect(searchTerms("  GONÇALVES  Júnior ")).toEqual({ text: "goncalves junior", digits: null });
  });

  it("número com ou sem pontuação vira só os dígitos", () => {
    expect(searchTerms("296.003.843-63")).toEqual({ text: "296.003.843-63", digits: "29600384363" });
    expect(searchTerms("(14) 98811-2031").digits).toBe("14988112031");
    expect(searchTerms("3524-1212").digits).toBe("35241212");
  });

  it("texto com número dentro e número curto ficam só como texto", () => {
    expect(searchTerms("Rua 15").digits).toBeNull();
    expect(searchTerms("12").digits).toBeNull();
  });
});
