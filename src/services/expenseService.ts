import type { ExpenseInput, ExpenseTemplateInput } from "@/features/expenses/schemas";
import { AppError } from "@/lib/errors";
import type { ActorContext } from "@/server/actor";
import type { Expense, ExpenseCategory, ExpenseTemplate } from "@/types/finance";
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

  listCategories(companyId: string): Promise<ExpenseCategory[]>;
  insertCategory(companyId: string, name: string): Promise<void>;
  renameCategory(companyId: string, categoryId: string, name: string): Promise<void>;
  softDeleteCategory(companyId: string, categoryId: string): Promise<void>;
  categoryInUse(companyId: string, categoryId: string): Promise<boolean>;
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
      return repo.insert(actor.companyId, input);
    },

    /** O pagamento de prestador vem do fechamento das horas: para corrigir, exclui e fecha de novo. */
    async update(actor: ActorContext, expenseId: string, input: ExpenseInput) {
      requireAccess(actor);
      const expense = await repo.get(actor.companyId, expenseId);
      if (!expense) throw new AppError("not_found", "Gasto não encontrado");
      if (expense.kind === "contractor") {
        throw new AppError("conflict", "Este gasto veio do fechamento das horas. Para corrigir, exclua e feche de novo.");
      }
      await repo.update(actor.companyId, expenseId, input);
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
