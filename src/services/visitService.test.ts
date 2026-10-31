import { describe, expect, it, vi } from "vitest";
import type { VisitInput } from "@/features/visits/schemas";
import { visitSchema } from "@/features/visits/schemas";
import type { ActorContext } from "@/server/actor";
import type { VisitBusySlot, VisitListItem } from "@/types/database";
import { createVisitService, findConflicts, type VisitRepository } from "./visitService";

const OWNER: ActorContext = { companyId: "co", role: "owner" };
const MEMBER: ActorContext = { companyId: "co", role: "member" };
const TECHNICIAN: ActorContext = { companyId: "co", role: "technician" };

const SLOT: VisitBusySlot = {
  visit_id: "v1",
  employee_id: "e1",
  visit_date: "2026-11-02",
  starts_at: "08:00:00",
  ends_at: "12:00:00",
  client_name: "Hotel",
};

function makeRepo() {
  return {
    list: vi.fn(async (): Promise<VisitListItem[]> => []),
    listBusySlots: vi.fn(async () => [SLOT]),
    listQuotePicker: vi.fn(async () => []),
    save: vi.fn(async () => "v9"),
    softDelete: vi.fn(async () => undefined),
  } satisfies VisitRepository;
}

describe("conflitos de horário", () => {
  it("avisa quando sobrepõe", () => {
    expect(findConflicts([SLOT], { visitId: null, startsAt: "11:00", endsAt: "13:00" })).toEqual([
      { employeeId: "e1", clientName: "Hotel", startsAt: "08:00", endsAt: "12:00" },
    ]);
  });

  it("encostar não conflita", () => {
    expect(findConflicts([SLOT], { visitId: null, startsAt: "12:00", endsAt: "13:00" })).toEqual([]);
  });

  it("ignora a própria visita ao editar", () => {
    expect(findConflicts([SLOT], { visitId: "v1", startsAt: "09:00", endsAt: "10:00" })).toEqual([]);
  });

  it("horário inválido ainda não gera aviso", () => {
    expect(findConflicts([SLOT], { visitId: null, startsAt: "12:00", endsAt: "08:00" })).toEqual([]);
  });
});

describe("agenda", () => {
  it("técnico não usa a agenda do escritório", async () => {
    const service = createVisitService(makeRepo());
    await expect(service.list(TECHNICIAN, {})).rejects.toMatchObject({ code: "forbidden" });
    await expect(service.save(TECHNICIAN, null, {} as VisitInput)).rejects.toMatchObject({ code: "forbidden" });
  });

  it("member agenda, mas só owner e admin excluem", async () => {
    const repo = makeRepo();
    const service = createVisitService(repo);
    await service.save(MEMBER, null, {} as VisitInput);
    expect(repo.save).toHaveBeenCalledOnce();
    await expect(service.remove(MEMBER, "v1")).rejects.toMatchObject({ code: "forbidden" });
    await service.remove(OWNER, "v1");
    expect(repo.softDelete).toHaveBeenCalledWith("co", "v1");
  });

  it("filtra por pessoa da equipe", async () => {
    const repo = makeRepo();
    repo.list.mockResolvedValue([
      { id: "a", employees: [{ id: "e1", name: "Ana" }] },
      { id: "b", employees: [{ id: "e2", name: "Bia" }] },
    ] as VisitListItem[]);
    const visits = await createVisitService(repo).list(OWNER, { employeeId: "e2" });
    expect(visits.map((visit) => visit.id)).toEqual(["b"]);
  });
});

describe("validação da visita", () => {
  const VALID = {
    clientId: "11111111-1111-4111-8111-111111111111",
    locationId: "22222222-2222-4222-8222-222222222222",
    quoteId: "",
    kind: "execution",
    visitDate: "2026-11-02",
    startsAt: "08:00",
    endsAt: "12:00",
    status: "scheduled",
    notes: "",
    employeeIds: ["33333333-3333-4333-8333-333333333333"],
  };

  it("aceita visita completa", () => {
    expect(visitSchema.safeParse(VALID).success).toBe(true);
  });

  it("exige cliente, local, data, equipe e fim depois do início", () => {
    expect(visitSchema.safeParse({ ...VALID, clientId: "" }).success).toBe(false);
    expect(visitSchema.safeParse({ ...VALID, locationId: "" }).success).toBe(false);
    expect(visitSchema.safeParse({ ...VALID, visitDate: "" }).success).toBe(false);
    expect(visitSchema.safeParse({ ...VALID, employeeIds: [] }).success).toBe(false);
    expect(visitSchema.safeParse({ ...VALID, endsAt: "08:00" }).success).toBe(false);
  });
});
