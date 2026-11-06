import { describe, expect, it } from "vitest";
import { fitInFrame } from "@/features/documents/pdf-image";
import { photoLabel, workedTime, workOrderFileName } from "./pdf";

describe("fitInFrame", () => {
  it("mantém a proporção e centraliza sem passar da moldura", () => {
    const wide = fitInFrame(1600, 900, 80, 60);
    expect(wide.width).toBeCloseTo(80);
    expect(wide.height).toBeCloseTo(45);
    expect(wide.offsetY).toBeCloseTo(7.5);
    const tall = fitInFrame(900, 1600, 80, 60);
    expect(tall.height).toBeCloseTo(60);
    expect(tall.width).toBeCloseTo(33.75);
    expect(tall.offsetX).toBeCloseTo(23.125);
  });
});

describe("photoLabel", () => {
  it("numera a foto e só inclui legenda preenchida", () => {
    expect(photoLabel(0, "Antes do serviço")).toBe("Foto 1 — Antes do serviço");
    expect(photoLabel(2, null)).toBe("Foto 3");
    expect(photoLabel(1, "   ")).toBe("Foto 2");
  });
});

describe("workedTime", () => {
  it("calcula a duração e ignora horários inválidos", () => {
    expect(workedTime("08:05:00", "11:33:00")).toBe("3h28");
    expect(workedTime("08:00", "10:00")).toBe("2h");
    expect(workedTime("08:00", "08:40")).toBe("40 min");
    expect(workedTime("08:00", null)).toBe("");
    expect(workedTime("10:00", "09:00")).toBe("");
  });
});

describe("workOrderFileName", () => {
  it("gera nome sem acentos nem símbolos", () => {
    expect(workOrderFileName("Padaria São João & Filhos", "2026-11-01")).toBe("ordem-de-servico-padaria-sao-joao-filhos-2026-11-01.pdf");
  });
});
