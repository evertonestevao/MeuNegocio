import { supplierSearchKey, type ExpenseInput, type ExpenseTemplateInput, type SupplierInput, type SupplierPurchaseFilters } from "@/features/expenses/schemas";
import { AppError } from "@/lib/errors";
import type { ActorContext } from "@/server/actor";
import type { Expense, ExpenseCategory, ExpenseTemplate, Supplier, SupplierSpend } from "@/types/finance";
import { permissionService } from "./permissionService";

/** Gastos, recorrências e categorias. Só o proprietário e o administrador. */

export interface ExpenseRepository {
  list(companyId: string, from: string, to: string): Promise<Expense[]>;
  get(companyId: string, expenseId: string): Promise<Expense | null>;
  insert(companyId: string, input: ExpenseInput): Promise<string>;
  update(companyId: string, expenseId: string, input: ExpenseInput): Promise<void>;
  /** Pela função do banco, que reabre as horas de um pagamento de prestador. */
  remove(companyId: string, expenseId: string): Promise<void>;
  generateMonth(companyId: string, month: string): Promise<number>;

  listTemplates(companyId: string): Promise<ExpenseTemplate[]>;
  insertTemplate(companyId: string, input: ExpenseTemplateInput): Promise<void>;
  updateTemplate(companyId: string, templateId: string, input: ExpenseTemplateInput): Promise<void>;
  softDeleteTemplate(companyId: string, templateId: string): Promise<void>;

  listSuppliers(companyId: string): Promise<Supplier[]>;
  getSupplier(companyId: string, supplierId: string): Promise<Supplier | null>;
  insertSupplier(companyId: string, input: SupplierInput): Promise<string>;
  updateSupplier(companyId: string, supplierId: string, input: SupplierInput): Promise<void>;
  softDeleteSupplier(companyId: string, supplierId: string): Promise<void>;
  /** Gastos com fornecedor desde `from` (ou todos). */
  listSupplierSpend(companyId: string, from: string | null): Promise<SupplierSpend[]>;
  /** Todas as compras (gastos) ligadas a um fornecedor, da mais recente para a mais antiga. */
  listBySupplier(companyId: string, supplierId: string): Promise<Expense[]>;

  listCategories(companyId: string): Promise<ExpenseCategory[]>;
  insertCategory(companyId: string, name: string): Promise<void>;
  renameCategory(companyId: string, categoryId: string, name: string): Promise<void>;
  softDeleteCategory(companyId: string, categoryId: string): Promise<void>;
  categoryInUse(companyId: string, categoryId: string): Promise<boolean>;
}

export interface SupplierStats {
  supplier: Supplier;
  totalCents: number;
  purchases: number;
  lastPurchase: string | null;
  topCategories: string[];
}

export interface CategorySuppliers {
  categoryId: string;
  name: string;
  totalCents: number;
  suppliers: { supplierId: string; name: string; totalCents: number; sharePercent: number }[];
}

/** Quanto se gastou com cada fornecedor e, em cada categoria, de quem mais se compra. */
export function buildSupplierStats(suppliers: Supplier[], spend: SupplierSpend[]) {
  const byId = new Map(suppliers.map((supplier) => [supplier.id, supplier]));
  const stats = suppliers.map((supplier): SupplierStats => {
    const mine = spend.filter((item) => item.supplier_id === supplier.id);
    const categories = totalsByCategory(mine.map((item) => ({ ...item })));
    return {
      supplier,
      totalCents: mine.reduce((sum, item) => sum + item.amount_cents, 0),
      purchases: mine.length,
      lastPurchase: mine.reduce<string | null>((last, item) => (!last || item.expense_date > last ? item.expense_date : last), null),
      topCategories: categories.slice(0, 2).map((category) => category.name),
    };
  });
  stats.sort((a, b) => b.totalCents - a.totalCents || a.supplier.name.localeCompare(b.supplier.name, "pt-BR"));

  const categories = new Map<string, CategorySuppliers>();
  for (const item of spend) {
    const supplier = byId.get(item.supplier_id);
    if (!supplier) continue;
    const category = categories.get(item.category_id) ?? { categoryId: item.category_id, name: item.category_name, totalCents: 0, suppliers: [] };
    category.totalCents += item.amount_cents;
    const entry = category.suppliers.find((candidate) => candidate.supplierId === supplier.id);
    if (entry) entry.totalCents += item.amount_cents;
    else category.suppliers.push({ supplierId: supplier.id, name: supplier.name, totalCents: item.amount_cents, sharePercent: 0 });
    categories.set(item.category_id, category);
  }
  const byCategory = [...categories.values()]
    .map((category) => ({
      ...category,
      suppliers: category.suppliers
        .map((entry) => ({ ...entry, sharePercent: Math.round((entry.totalCents / category.totalCents) * 100) }))
        .sort((a, b) => b.totalCents - a.totalCents)
        .slice(0, 3),
    }))
    .sort((a, b) => b.totalCents - a.totalCents);

  return { stats, byCategory };
}

export interface SupplierPurchaseSummary {
  totalCents: number;
  count: number;
  firstPurchase: string | null;
  lastPurchase: string | null;
  minCents: number | null;
  maxCents: number | null;
  avgCents: number | null;
}

/** Visão geral das compras de um fornecedor, sempre sobre todas elas (o filtro não a mexe). */
export function summarizeSupplierPurchases(purchases: Expense[]): SupplierPurchaseSummary {
  if (purchases.length === 0) {
    return { totalCents: 0, count: 0, firstPurchase: null, lastPurchase: null, minCents: null, maxCents: null, avgCents: null };
  }
  const totalCents = purchases.reduce((sum, item) => sum + item.amount_cents, 0);
  const amounts = purchases.map((item) => item.amount_cents);
  const dates = purchases.map((item) => item.expense_date);
  return {
    totalCents,
    count: purchases.length,
    firstPurchase: dates.reduce((min, date) => (date < min ? date : min)),
    lastPurchase: dates.reduce((max, date) => (date > max ? date : max)),
    minCents: Math.min(...amounts),
    maxCents: Math.max(...amounts),
    avgCents: Math.round(totalCents / purchases.length),
  };
}

const byDateDesc = (a: Expense, b: Expense) => (a.expense_date < b.expense_date ? 1 : a.expense_date > b.expense_date ? -1 : 0);

/** Aplica busca (descrição e categoria), faixa de preço e ordenação à lista de compras. */
export function filterSupplierPurchases(purchases: Expense[], filters: SupplierPurchaseFilters): Expense[] {
  const needle = supplierSearchKey(filters.search);
  const filtered = purchases.filter((item) => {
    if (filters.minCents !== null && item.amount_cents < filters.minCents) return false;
    if (filters.maxCents !== null && item.amount_cents > filters.maxCents) return false;
    if (needle && !supplierSearchKey(`${item.description} ${item.category_name}`).includes(needle)) return false;
    return true;
  });
  return filters.sort === "amount"
    ? filtered.toSorted((a, b) => b.amount_cents - a.amount_cents || byDateDesc(a, b))
    : filtered.toSorted(byDateDesc);
}

export interface CategoryTotal {
  categoryId: string;
  name: string;
  totalCents: number;
}

/** Total por categoria, do maior para o menor. */
export function totalsByCategory(expenses: Pick<Expense, "category_id" | "category_name" | "amount_cents">[]): CategoryTotal[] {
  const totals = new Map<string, CategoryTotal>();
  for (const expense of expenses) {
    const current = totals.get(expense.category_id) ?? { categoryId: expense.category_id, name: expense.category_name, totalCents: 0 };
    current.totalCents += expense.amount_cents;
    totals.set(expense.category_id, current);
  }
  return [...totals.values()].sort((a, b) => b.totalCents - a.totalCents);
}

export function createExpenseService(repo: ExpenseRepository) {
  /** Nome digitado sem escolher da lista: usa o cadastro de mesmo nome ou cria um. */
  async function withSupplier(companyId: string, input: ExpenseInput): Promise<ExpenseInput> {
    if (input.supplierId || !input.supplierName) return input;
    const key = supplierSearchKey(input.supplierName);
    const existing = (await repo.listSuppliers(companyId)).find((supplier) => supplierSearchKey(supplier.name) === key);
    if (existing) return { ...input, supplierId: existing.id };
    try {
      const supplierId = await repo.insertSupplier(companyId, { name: input.supplierName, document: null, phone: null, notes: null });
      return { ...input, supplierId };
    } catch (err) {
      // Outra pessoa cadastrou o mesmo nome no mesmo instante: usa o dela.
      const again = (await repo.listSuppliers(companyId)).find((supplier) => supplierSearchKey(supplier.name) === key);
      if (again) return { ...input, supplierId: again.id };
      throw err;
    }
  }

  function requireAccess({ role }: ActorContext): void {
    if (!permissionService.canManageFinance(role)) {
      throw new AppError("forbidden", "Só o proprietário e o administrador acessam gastos");
    }
  }

  return {
    async list(actor: ActorContext, from: string, to: string) {
      requireAccess(actor);
      return repo.list(actor.companyId, from, to);
    },

    async create(actor: ActorContext, input: ExpenseInput) {
      requireAccess(actor);
      return repo.insert(actor.companyId, await withSupplier(actor.companyId, input));
    },

    /** O pagamento de prestador vem do fechamento das horas: para corrigir, exclui e fecha de novo. */
    async update(actor: ActorContext, expenseId: string, input: ExpenseInput) {
      requireAccess(actor);
      const expense = await repo.get(actor.companyId, expenseId);
      if (!expense) throw new AppError("not_found", "Gasto não encontrado");
      if (expense.kind === "contractor") {
        throw new AppError("conflict", "Este gasto veio do fechamento das horas. Para corrigir, exclua e feche de novo.");
      }
      await repo.update(actor.companyId, expenseId, await withSupplier(actor.companyId, input));
    },

    async remove(actor: ActorContext, expenseId: string) {
      requireAccess(actor);
      await repo.remove(actor.companyId, expenseId);
    },

    async generateMonth(actor: ActorContext, month: string) {
      requireAccess(actor);
      return repo.generateMonth(actor.companyId, month);
    },

    async listTemplates(actor: ActorContext) {
      requireAccess(actor);
      return repo.listTemplates(actor.companyId);
    },

    async saveTemplate(actor: ActorContext, templateId: string | null, input: ExpenseTemplateInput) {
      requireAccess(actor);
      if (templateId) await repo.updateTemplate(actor.companyId, templateId, input);
      else await repo.insertTemplate(actor.companyId, input);
    },

    /** O que já foi gerado continua lançado. */
    async removeTemplate(actor: ActorContext, templateId: string) {
      requireAccess(actor);
      await repo.softDeleteTemplate(actor.companyId, templateId);
    },

    async listSuppliers(actor: ActorContext) {
      requireAccess(actor);
      return repo.listSuppliers(actor.companyId);
    },

    async saveSupplier(actor: ActorContext, supplierId: string | null, input: SupplierInput) {
      requireAccess(actor);
      if (supplierId) await repo.updateSupplier(actor.companyId, supplierId, input);
      else await repo.insertSupplier(actor.companyId, input);
    },

    async removeSupplier(actor: ActorContext, supplierId: string) {
      requireAccess(actor);
      await repo.softDeleteSupplier(actor.companyId, supplierId);
    },

    async supplierStats(actor: ActorContext, from: string | null) {
      requireAccess(actor);
      const [suppliers, spend] = await Promise.all([repo.listSuppliers(actor.companyId), repo.listSupplierSpend(actor.companyId, from)]);
      return buildSupplierStats(suppliers, spend);
    },

    /** Ficha do fornecedor: cadastro, visão geral das compras e a lista filtrada. */
    async supplierDetail(actor: ActorContext, supplierId: string, filters: SupplierPurchaseFilters) {
      requireAccess(actor);
      const supplier = await repo.getSupplier(actor.companyId, supplierId);
      if (!supplier) throw new AppError("not_found", "Fornecedor não encontrado");
      const purchases = await repo.listBySupplier(actor.companyId, supplierId);
      return {
        supplier,
        summary: summarizeSupplierPurchases(purchases),
        purchases: filterSupplierPurchases(purchases, filters),
        totalCount: purchases.length,
      };
    },

    async listCategories(actor: ActorContext) {
      requireAccess(actor);
      return repo.listCategories(actor.companyId);
    },

    async saveCategory(actor: ActorContext, categoryId: string | null, name: string) {
      requireAccess(actor);
      if (categoryId) await repo.renameCategory(actor.companyId, categoryId, name);
      else await repo.insertCategory(actor.companyId, name);
    },

    async removeCategory(actor: ActorContext, categoryId: string) {
      requireAccess(actor);
      const categories = await repo.listCategories(actor.companyId);
      const category = categories.find((candidate) => candidate.id === categoryId);
      if (!category) throw new AppError("not_found", "Categoria não encontrada");
      if (category.system_key) {
        throw new AppError("conflict", "Esta categoria é usada pelo sistema e não pode ser excluída.");
      }
      if (await repo.categoryInUse(actor.companyId, categoryId)) {
        throw new AppError("conflict", "Esta categoria está em uso por gastos ou recorrências.");
      }
      await repo.softDeleteCategory(actor.companyId, categoryId);
    },
  };
}

export type ExpenseService = ReturnType<typeof createExpenseService>;
