import { describe, expect, it, vi } from "vitest";
import type { TimeEntryInput } from "@/features/hours/schemas";
import { timeEntrySchema } from "@/features/hours/schemas";
import type { ActorContext } from "@/server/actor";
import type { HoursEmployee, HoursMonth, TimeEntry, TimeSuggestion } from "@/types/finance";
import { createHoursService, summarizeHours, type HoursRepository } from "./hoursService";

const OWNER: ActorContext = { companyId: "co", role: "owner" };
const EMPTY: HoursMonth = { employees: [], entries: [], suggestions: [] };

const person = (overrides: Partial<HoursEmployee>): HoursEmployee => ({
  id: "e1", name: "Ana", active: true, contract_type: "pj", hourly_pay_cents: 6000, ...overrides,
});
const entry = (overrides: Partial<TimeEntry>): TimeEntry => ({
  id: "t1", employee_id: "e1", entry_date: "2026-10-01", starts_at: "08:00:00", ends_at: "12:00:00", break_minutes: 0,
  visit_id: null, client_id: null, client_name: null, location_name: null, notes: null, status: "approved", ...overrides,
});
const suggestion = (overrides: Partial<TimeSuggestion>): TimeSuggestion => ({
  visit_id: "v1", employee_id: "e1", entry_date: "2026-10-02", starts_at: "08:00:00", ends_at: "10:00:00", break_minutes: 0,
  client_id: "c", client_name: "Hotel", location_name: "Sede", dismissed: false, ...overrides,
});

function setup(canUse = true) {
  const repo = {
    getMonth: vi.fn(async () => EMPTY),
    save: vi.fn(async () => "t1"),
    setStatus: vi.fn(async () => undefined),
    remove: vi.fn(async () => undefined),
    setDismissed: vi.fn(async () => undefined),
    close: vi.fn(async () => "x1"),
  } satisfies HoursRepository;
  return { repo, service: createHoursService({ repo, canUseHours: async () => canUse }) };
}

describe("resumo de horas", () => {
  it("em aberto soma não pagos e sugestões não retiradas", () => {
    const [row] = summarizeHours({
      employees: [person({})],
      entries: [entry({}), entry({ id: "t2", status: "paid", starts_at: "13:00:00", ends_at: "14:00:00" })],
      suggestions: [suggestion({}), suggestion({ visit_id: "v2", dismissed: true })],
    });
    expect(row.openMinutes).toBe(360);
    expect(row.paidMinutes).toBe(60);
    expect(row.openPayCents).toBe(36000);
  });

  it("CLT aparece, mas não tem valor a pagar", () => {
    const [row] = summarizeHours({ employees: [person({ contract_type: "clt" })], entries: [entry({})], suggestions: [] });
    expect(row.openMinutes).toBe(240);
    expect(row.openPayCents).toBe(0);
  });

  it("prestadores primeiro; inativo sem horas some", () => {
    const rows = summarizeHours({
      employees: [
        person({ id: "a", name: "Ana", contract_type: "clt" }),
        person({ id: "z", name: "Zeca" }),
        person({ id: "i", name: "Inativo", active: false }),
      ],
      entries: [],
      suggestions: [],
    });
    expect(rows.map((row) => row.id)).toEqual(["z", "a"]);
  });
});

describe("acesso às horas", () => {
  it("member e técnico não acessam", async () => {
    const { service } = setup();
    for (const role of ["member", "technician"]) {
      await expect(service.getMonth({ companyId: "co", role }, "2026-10-01")).rejects.toMatchObject({ code: "forbidden" });
      await expect(service.close({ companyId: "co", role }, "e1", "2026-10-01")).rejects.toMatchObject({ code: "forbidden" });
    }
  });

  it("plano sem o recurso não acessa", async () => {
    const { repo, service } = setup(false);
    await expect(service.close(OWNER, "e1", "2026-10-01")).rejects.toMatchObject({ code: "forbidden" });
    await expect(service.save(OWNER, null, {} as TimeEntryInput)).rejects.toMatchObject({ code: "forbidden" });
    expect(repo.close).not.toHaveBeenCalled();
  });

  it("owner fecha o mês", async () => {
    const { repo, service } = setup();
    await service.close(OWNER, "e1", "2026-10-01");
    expect(repo.close).toHaveBeenCalledWith("co", "e1", "2026-10-01");
  });
});

describe("validação de horas", () => {
  const VALID = {
    employeeId: "11111111-1111-4111-8111-111111111111",
    entryDate: "2026-10-01",
    startsAt: "08:00",
    endsAt: "12:00",
    breakMinutes: "0",
    visitId: "",
    clientId: "",
    notes: "",
  };

  it("aceita hora avulsa, sem visita", () => {
    expect(timeEntrySchema.parse(VALID).visitId).toBeNull();
  });

  it("exige saída depois da entrada e intervalo válido", () => {
    expect(timeEntrySchema.safeParse({ ...VALID, endsAt: "08:00" }).success).toBe(false);
    expect(timeEntrySchema.safeParse({ ...VALID, breakMinutes: "-5" }).success).toBe(false);
  });
});
