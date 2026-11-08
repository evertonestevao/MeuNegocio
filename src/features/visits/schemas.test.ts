import { describe, expect, it } from "vitest";
import { isVisitOverdue } from "./schemas";

const now = { today: "2026-11-08", time: "19:00" };
const visit = (status: string, visit_date: string, starts_at: string) => ({ status, visit_date, starts_at });

describe("isVisitOverdue", () => {
  it("agendada que passou da hora hoje está atrasada", () => {
    expect(isVisitOverdue(visit("scheduled", "2026-11-08", "11:00"), now)).toBe(true);
  });

  it("agendada de um dia anterior está atrasada", () => {
    expect(isVisitOverdue(visit("scheduled", "2026-11-07", "23:00"), now)).toBe(true);
  });

  it("agendada ainda por vir hoje não está atrasada", () => {
    expect(isVisitOverdue(visit("scheduled", "2026-11-08", "20:30"), now)).toBe(false);
  });

  it("agendada de amanhã não está atrasada", () => {
    expect(isVisitOverdue(visit("scheduled", "2026-11-09", "08:00"), now)).toBe(false);
  });

  it("em andamento, concluída ou cancelada nunca contam como atrasada", () => {
    expect(isVisitOverdue(visit("in_progress", "2026-11-08", "11:00"), now)).toBe(false);
    expect(isVisitOverdue(visit("completed", "2026-11-07", "11:00"), now)).toBe(false);
    expect(isVisitOverdue(visit("canceled", "2026-11-07", "11:00"), now)).toBe(false);
  });
});
