import { describe, expect, it, vi } from "vitest";
import type { ExpenseInput } from "@/features/expenses/schemas";
import { expenseSchema, expenseTemplateSchema } from "@/features/expenses/schemas";
import type { ActorContext } from "@/server/actor";
import type { Expense, ExpenseCategory } from "@/types/finance";
import { createExpenseService, totalsByCategory, type ExpenseRepository } from "./expenseService";

const OWNER: ActorContext = { companyId: "co", role: "owner" };
const INPUT = {} as ExpenseInput;

function makeRepo() {
  return {
    list: vi.fn(async () => []),
    get: vi.fn(async (): Promise<Expense | null> => ({ id: "x", kind: "one_off" }) as Expense),
    insert: vi.fn(async () => "x"),
    update: vi.fn(async () => undefined),
    remove: vi.fn(async () => undefined),
    generateMonth: vi.fn(async () => 2),
    listTemplates: vi.fn(async () => []),
    insertTemplate: vi.fn(async () => undefined),
    updateTemplate: vi.fn(async () => undefined),
    softDeleteTemplate: vi.fn(async () => undefined),
    listCategories: vi.fn(async (): Promise<ExpenseCategory[]> => [
      { id: "c1", name: "Aluguel", system_key: null },
      { id: "c2", name: "Prestadores", system_key: "contractors" },
    ]),
    insertCategory: vi.fn(async () => undefined),
    renameCategory: vi.fn(async () => undefined),
    softDeleteCategory: vi.fn(async () => undefined),
    categoryInUse: vi.fn(async () => false),
  } satisfies ExpenseRepository;
}

describe("gastos", () => {
  it("member e técnico não acessam", async () => {
    const service = createExpenseService(makeRepo());
    for (const role of ["member", "technician"]) {
      const actor = { companyId: "co", role };
      await expect(service.list(actor, "a", "b")).rejects.toMatchObject({ code: "forbidden" });
      await expect(service.create(actor, INPUT)).rejects.toMatchObject({ code: "forbidden" });
      await expect(service.generateMonth(actor, "2026-10-01")).rejects.toMatchObject({ code: "forbidden" });
      await expect(service.removeCategory(actor, "c1")).rejects.toMatchObject({ code: "forbidden" });
    }
  });

  it("pagamento de prestador não é editado", async () => {
    const repo = makeRepo();
    repo.get.mockResolvedValue({ id: "x", kind: "contractor" } as Expense);
    await expect(createExpenseService(repo).update(OWNER, "x", INPUT)).rejects.toThrow("fechamento");
    expect(repo.update).not.toHaveBeenCalled();
  });

  it("gasto de outra empresa não é encontrado", async () => {
    const repo = makeRepo();
    repo.get.mockResolvedValue(null);
    await expect(createExpenseService(repo).update(OWNER, "x", INPUT)).rejects.toMatchObject({ code: "not_found" });
  });

  it("categoria em uso ou do sistema não é excluída", async () => {
    const repo = makeRepo();
    const service = createExpenseService(repo);
    await expect(service.removeCategory(OWNER, "c2")).rejects.toThrow("sistema");
    repo.categoryInUse.mockResolvedValue(true);
    await expect(service.removeCategory(OWNER, "c1")).rejects.toThrow("em uso");
    expect(repo.softDeleteCategory).not.toHaveBeenCalled();
    repo.categoryInUse.mockResolvedValue(false);
    await service.removeCategory(OWNER, "c1");
    expect(repo.softDeleteCategory).toHaveBeenCalledWith("co", "c1");
  });

  it("soma por categoria, do maior para o menor", () => {
    expect(
      totalsByCategory([
        { category_id: "a", category_name: "A", amount_cents: 100 },
        { category_id: "b", category_name: "B", amount_cents: 500 },
        { category_id: "a", category_name: "A", amount_cents: 50 },
      ]),
    ).toEqual([
      { categoryId: "b", name: "B", totalCents: 500 },
      { categoryId: "a", name: "A", totalCents: 150 },
    ]);
  });
});

describe("validação de gastos", () => {
  const CATEGORY = "11111111-1111-4111-8111-111111111111";

  it("valor precisa ser positivo", () => {
    const valid = { description: "Luz", categoryId: CATEGORY, amountCents: "10,50", expenseDate: "2026-10-01", employeeId: "", notes: "" };
    expect(expenseSchema.parse(valid).amountCents).toBe(1050);
    expect(expenseSchema.safeParse({ ...valid, amountCents: "0" }).success).toBe(false);
    expect(expenseSchema.safeParse({ ...valid, amountCents: "abc" }).success).toBe(false);
  });

  it("recorrência usa dia de 1 a 28 e fim depois do início", () => {
    const valid = { description: "Aluguel", categoryId: CATEGORY, amountCents: "100", employeeId: "", dayOfMonth: "5", startsOn: "2026-01-01", endsOn: "", active: true };
    expect(expenseTemplateSchema.safeParse(valid).success).toBe(true);
    expect(expenseTemplateSchema.safeParse({ ...valid, dayOfMonth: "29" }).success).toBe(false);
    expect(expenseTemplateSchema.safeParse({ ...valid, dayOfMonth: "0" }).success).toBe(false);
    expect(expenseTemplateSchema.safeParse({ ...valid, endsOn: "2025-01-01" }).success).toBe(false);
  });
});
