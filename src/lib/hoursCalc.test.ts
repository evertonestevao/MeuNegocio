import { describe, expect, it } from "vitest";
import { formatMinutes, payCents, workedMinutes } from "./hoursCalc";

describe("cálculo de horas", () => {
  it("desconta o intervalo e aceita segundos do banco", () => {
    expect(workedMinutes({ starts_at: "08:00:00", ends_at: "17:00:00", break_minutes: 60 })).toBe(480);
    expect(workedMinutes({ starts_at: "08:00", ends_at: "08:30", break_minutes: 0 })).toBe(30);
  });

  it("nunca fica negativo", () => {
    expect(workedMinutes({ starts_at: "08:00", ends_at: "09:00", break_minutes: 90 })).toBe(0);
  });

  it("formata como no protótipo", () => {
    expect(formatMinutes(480)).toBe("8h");
    expect(formatMinutes(610)).toBe("10h10");
    expect(formatMinutes(5)).toBe("0h05");
  });

  it("calcula o valor sobre o total, como no protótipo", () => {
    expect(payCents(610, 7500)).toBe(76250);
    expect(payCents(1920, 6000)).toBe(192000);
  });
});
