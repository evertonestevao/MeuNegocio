import { describe, expect, it } from "vitest";
import { greetingFor } from "./dates";

describe("greetingFor", () => {
  it("usa a hora no fuso da empresa", () => {
    const at = new Date("2026-11-01T11:00:00Z"); // 08:00 em São Paulo
    expect(greetingFor("America/Sao_Paulo", at)).toBe("Bom dia!");
    expect(greetingFor("America/Sao_Paulo", new Date("2026-11-01T18:00:00Z"))).toBe("Boa tarde!");
    expect(greetingFor("America/Sao_Paulo", new Date("2026-11-01T23:30:00Z"))).toBe("Boa noite!");
    expect(greetingFor("America/Sao_Paulo", new Date("2026-11-01T06:00:00Z"))).toBe("Boa noite!");
  });
});
