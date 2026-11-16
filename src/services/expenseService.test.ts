import { describe, expect, it, vi } from "vitest";
import type { ExpenseInput } from "@/features/expenses/schemas";
import { expenseSchema, expenseTemplateSchema, supplierSchema, supplierSearchKey, type SupplierPurchaseFilters } from "@/features/expenses/schemas";
import type { ActorContext } from "@/server/actor";
import type { Expense, ExpenseCategory, Supplier, SupplierSpend } from "@/types/finance";
import {
  buildSupplierStats,
  createExpenseService,
  filterSupplierPurchases,
  summarizeSupplierPurchases,
  totalsByCategory,
  type ExpenseRepository,
} from "./expenseService";

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
    listSuppliers: vi.fn(async (): Promise<Supplier[]> => [{ id: "s1", name: "Casa do Eletricista", document: null, phone: null, notes: null }]),
    getSupplier: vi.fn(async (): Promise<Supplier | null> => ({ id: "s1", name: "Casa do Eletricista", document: null, phone: null, notes: null })),
    insertSupplier: vi.fn(async () => "s-new"),
    updateSupplier: vi.fn(async () => undefined),
    softDeleteSupplier: vi.fn(async () => undefined),
    listSupplierSpend: vi.fn(async (): Promise<SupplierSpend[]> => []),
    listBySupplier: vi.fn(async (): Promise<Expense[]> => []),
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

describe("fornecedores", () => {
  const supplierInput = (supplierName: string | null, supplierId: string | null = null) => ({ ...INPUT, supplierName, supplierId }) as ExpenseInput;

  it("nome digitado usa o cadastro de mesmo nome, sem diferença de acento ou maiúscula", async () => {
    const repo = makeRepo();
    await createExpenseService(repo).create(OWNER, supplierInput("  casa do ELETRICISTA "));
    expect(repo.insertSupplier).not.toHaveBeenCalled();
    expect(repo.insert).toHaveBeenCalledWith("co", expect.objectContaining({ supplierId: "s1" }));
  });

  it("nome novo vira fornecedor cadastrado; escolhido da lista não cria nada", async () => {
    const repo = makeRepo();
    const service = createExpenseService(repo);
    await service.create(OWNER, supplierInput("Ferragens Bauru"));
    expect(repo.insertSupplier).toHaveBeenCalledWith("co", expect.objectContaining({ name: "Ferragens Bauru" }));
    expect(repo.insert).toHaveBeenLastCalledWith("co", expect.objectContaining({ supplierId: "s-new" }));
    await service.create(OWNER, supplierInput("qualquer", "s1"));
    expect(repo.insertSupplier).toHaveBeenCalledTimes(1);
  });

  it("member e técnico não veem nem cadastram fornecedores", async () => {
    const service = createExpenseService(makeRepo());
    for (const role of ["member", "technician"]) {
      await expect(service.listSuppliers({ companyId: "co", role })).rejects.toMatchObject({ code: "forbidden" });
      await expect(service.supplierStats({ companyId: "co", role }, null)).rejects.toMatchObject({ code: "forbidden" });
    }
  });

  it("soma por fornecedor e mostra de quem mais se compra em cada categoria", () => {
    const suppliers: Supplier[] = [
      { id: "a", name: "Alfa", document: null, phone: null, notes: null },
      { id: "b", name: "Beta", document: null, phone: null, notes: null },
      { id: "c", name: "Sem compras", document: null, phone: null, notes: null },
    ];
    const spend = (supplier_id: string, amount_cents: number, category: string, expense_date = "2026-10-01") =>
      ({ supplier_id, amount_cents, expense_date, category_id: category, category_name: category.toUpperCase() }) as SupplierSpend;
    const { stats, byCategory } = buildSupplierStats(suppliers, [
      spend("a", 300, "mat", "2026-10-05"),
      spend("a", 100, "comb"),
      spend("b", 700, "mat", "2026-09-01"),
    ]);
    expect(stats.map((item) => [item.supplier.id, item.totalCents, item.purchases])).toEqual([["b", 700, 1], ["a", 400, 2], ["c", 0, 0]]);
    expect(stats[1].lastPurchase).toBe("2026-10-05");
    expect(stats[1].topCategories).toEqual(["MAT", "COMB"]);
    expect(byCategory[0]).toMatchObject({ categoryId: "mat", totalCents: 1000 });
    expect(byCategory[0].suppliers.map((entry) => [entry.name, entry.sharePercent])).toEqual([["Beta", 70], ["Alfa", 30]]);
  });

  it("valida documento e telefone e normaliza o nome para a busca", () => {
    expect(supplierSchema.parse({ name: "Loja", document: "12345678000195", phone: "14997122258" })).toMatchObject({ document: "12.345.678/0001-95", phone: "(14) 99712-2258" });
    expect(supplierSchema.safeParse({ name: "Loja", document: "123" }).success).toBe(false);
    expect(supplierSchema.safeParse({ name: "L" }).success).toBe(false);
    expect(supplierSearchKey("  Elétrica  Paulista ")).toBe("eletrica paulista");
  });
});

describe("ficha do fornecedor", () => {
  const purchase = (id: string, amount_cents: number, expense_date: string, description = "", category_name = "Materiais"): Expense =>
    ({ id, amount_cents, expense_date, description, category_name, kind: "one_off" }) as Expense;

  const PURCHASES = [
    purchase("1", 5000, "2026-10-10", "Gás de cozinha", "Combustível"),
    purchase("2", 20000, "2026-09-01", "Peça do compressor", "Materiais"),
    purchase("3", 5000, "2026-08-15", "Gás P13", "Combustível"),
  ];

  const filters = (over: Partial<SupplierPurchaseFilters> = {}): SupplierPurchaseFilters => ({ search: "", minCents: null, maxCents: null, sort: "recent", ...over });

  it("resume total, contagem, faixa de preço e datas", () => {
    expect(summarizeSupplierPurchases(PURCHASES)).toEqual({
      totalCents: 30000,
      count: 3,
      firstPurchase: "2026-08-15",
      lastPurchase: "2026-10-10",
      minCents: 5000,
      maxCents: 20000,
      avgCents: 10000,
    });
    expect(summarizeSupplierPurchases([])).toMatchObject({ count: 0, totalCents: 0, minCents: null, avgCents: null });
  });

  it("filtra por faixa de preço e por texto (sem acento), e ordena por valor", () => {
    expect(filterSupplierPurchases(PURCHASES, filters({ minCents: 10000 })).map((p) => p.id)).toEqual(["2"]);
    expect(filterSupplierPurchases(PURCHASES, filters({ maxCents: 5000 })).map((p) => p.id)).toEqual(["1", "3"]);
    expect(filterSupplierPurchases(PURCHASES, filters({ search: "combustível" })).map((p) => p.id)).toEqual(["1", "3"]);
    expect(filterSupplierPurchases(PURCHASES, filters({ sort: "amount" })).map((p) => p.id)).toEqual(["2", "1", "3"]);
  });

  it("fornecedor de outra empresa não é encontrado e não busca as compras", async () => {
    const repo = makeRepo();
    repo.getSupplier.mockResolvedValue(null);
    await expect(createExpenseService(repo).supplierDetail(OWNER, "s1", filters())).rejects.toMatchObject({ code: "not_found" });
    expect(repo.listBySupplier).not.toHaveBeenCalled();
  });

  it("member não acessa a ficha", async () => {
    await expect(createExpenseService(makeRepo()).supplierDetail({ companyId: "co", role: "member" }, "s1", filters())).rejects.toMatchObject({ code: "forbidden" });
  });
});
