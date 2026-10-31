import { describe, expect, it, vi } from "vitest";
import type { EmployeeInput } from "@/features/team/schemas";
import { parseEmployeeForm } from "@/features/team/schemas";
import type { ActorContext } from "@/server/actor";
import type { Employee, EmployeePaymentDetails } from "@/types/database";
import { createEmployeeService, type EmployeeRepository, type UpcomingVisitRow } from "./employeeService";

const OWNER: ActorContext = { companyId: "co", role: "owner" };
const MEMBER: ActorContext = { companyId: "co", role: "member" };
const TECHNICIAN: ActorContext = { companyId: "co", role: "technician" };
const INPUT = { name: "Ana" } as EmployeeInput;

const employee = (overrides: Partial<Employee>): Employee => ({
  id: "e1",
  company_id: "co",
  name: "Ana",
  job_title: null,
  active: true,
  user_id: null,
  ...overrides,
});

function makeRepo() {
  return {
    list: vi.fn(async (): Promise<Employee[]> => []),
    get: vi.fn(async (): Promise<Employee | null> => employee({})),
    listDetails: vi.fn(async (): Promise<EmployeePaymentDetails[]> => []),
    listUpcomingVisits: vi.fn(async (): Promise<UpcomingVisitRow[]> => []),
    insert: vi.fn(async () => employee({})),
    update: vi.fn(async () => undefined),
    softDelete: vi.fn(async () => undefined),
    hasHistory: vi.fn(async () => false),
  } satisfies EmployeeRepository;
}

describe("equipe", () => {
  it("técnico não acessa", async () => {
    await expect(createEmployeeService(makeRepo()).list(TECHNICIAN, "2026-10-31")).rejects.toMatchObject({ code: "forbidden" });
  });

  it("member vê a lista sem buscar pagamento e não edita", async () => {
    const repo = makeRepo();
    repo.list.mockResolvedValue([employee({})]);
    const service = createEmployeeService(repo);
    const [row] = await service.list(MEMBER, "2026-10-31");
    expect(row.details).toBeNull();
    expect(repo.listDetails).not.toHaveBeenCalled();
    await expect(service.create(MEMBER, INPUT)).rejects.toMatchObject({ code: "forbidden" });
    await expect(service.update(MEMBER, "e1", INPUT)).rejects.toMatchObject({ code: "forbidden" });
    await expect(service.remove(MEMBER, "e1")).rejects.toMatchObject({ code: "forbidden" });
  });

  it("ordena ativos primeiro e traz a próxima visita", async () => {
    const repo = makeRepo();
    repo.list.mockResolvedValue([
      employee({ id: "z", name: "Zeca" }),
      employee({ id: "i", name: "Ana", active: false }),
      employee({ id: "b", name: "Bia" }),
    ]);
    repo.listUpcomingVisits.mockResolvedValue([
      { employee_id: "b", visit_date: "2026-11-01", starts_at: "08:00:00", client_name: "Hotel" },
      { employee_id: "b", visit_date: "2026-11-02", starts_at: "08:00:00", client_name: "Fábrica" },
    ]);
    const rows = await createEmployeeService(repo).list(OWNER, "2026-10-31");
    expect(rows.map((row) => row.id)).toEqual(["b", "z", "i"]);
    expect(rows[0].next_visit?.client_name).toBe("Hotel");
    expect(rows[0].upcoming_count).toBe(2);
    expect(rows[1].next_visit).toBeNull();
  });

  it("quem aparece em visita não é excluído", async () => {
    const repo = makeRepo();
    repo.hasHistory.mockResolvedValue(true);
    await expect(createEmployeeService(repo).remove(OWNER, "e1")).rejects.toThrow("Desative");
    expect(repo.softDelete).not.toHaveBeenCalled();
  });

  it("pessoa de outra empresa não é encontrada", async () => {
    const repo = makeRepo();
    repo.get.mockResolvedValue(null);
    await expect(createEmployeeService(repo).update(OWNER, "x", INPUT)).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("formulário da equipe", () => {
  function form(values: Record<string, string>): FormData {
    const data = new FormData();
    for (const [key, value] of Object.entries(values)) data.set(key, value);
    return data;
  }

  it("converte valores e aceita pessoa sem login", () => {
    const parsed = parseEmployeeForm(form({ name: "Ana Lima", contractType: "pj", hourlyPay: "60,00", active: "on" }));
    expect(parsed.hourlyPayCents).toBe(6000);
    expect(parsed.hourlyCostCents).toBe(0);
    expect(parsed.userId).toBeNull();
    expect(parsed.active).toBe(true);
  });

  it("recusa documento incompleto e contrato inválido", () => {
    expect(() => parseEmployeeForm(form({ name: "Ana", contractType: "pj", taxId: "123" }))).toThrow();
    expect(() => parseEmployeeForm(form({ name: "Ana", contractType: "x" }))).toThrow();
  });
});
