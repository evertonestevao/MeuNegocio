import { describe, expect, it } from "vitest";
import { addMonths, isValidDate, monthGrid, startOfWeek, timesOverlap, weekDays } from "./calendar";

describe("calendário", () => {
  it("semana começa no domingo", () => {
    expect(startOfWeek("2026-10-31")).toBe("2026-10-25");
    expect(weekDays("2026-10-25")).toHaveLength(7);
    expect(weekDays("2026-10-31")[6]).toBe("2026-10-31");
  });

  it("grade cobre o mês em semanas completas", () => {
    const grid = monthGrid("2026-10-15");
    expect(grid[0]).toBe("2026-09-27");
    expect(grid.at(-1)).toBe("2026-10-31");
    expect(grid).toHaveLength(35);
    expect(monthGrid("2026-02-10").length % 7).toBe(0);
    expect(monthGrid("2026-08-10")).toContain("2026-08-31");
  });

  it("soma meses sem pular no fim do mês", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-01");
    expect(addMonths("2026-12-10", 1)).toBe("2027-01-01");
    expect(addMonths("2026-01-10", -1)).toBe("2025-12-01");
  });

  it("valida datas", () => {
    expect(isValidDate("2026-02-28")).toBe(true);
    expect(isValidDate("2026-02-31")).toBe(false);
    expect(isValidDate("abc")).toBe(false);
    expect(isValidDate(undefined)).toBe(false);
  });

  it("horários que só encostam não conflitam", () => {
    expect(timesOverlap("08:00", "12:00", "12:00", "14:00")).toBe(false);
    expect(timesOverlap("08:00", "12:00", "11:59", "14:00")).toBe(true);
    expect(timesOverlap("09:00", "10:00", "08:00", "12:00")).toBe(true);
  });
});
