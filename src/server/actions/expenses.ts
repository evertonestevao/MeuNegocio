"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { categoryNameSchema, parseExpenseForm, parseExpenseTemplateForm, parseSupplierForm } from "@/features/expenses/schemas";
import { AppError } from "@/lib/errors";
import { getActor } from "@/server/actor";
import { recordAudit } from "@/server/audit";
import { getExpenseService } from "@/server/finance";
import { toActionError, type ActionState } from "./action-state";

function handleError(err: unknown): ActionState {
  if (err instanceof z.ZodError) return { error: err.issues[0]?.message ?? "Dados inválidos." };
  return toActionError(err);
}

function uuid(value: FormDataEntryValue | null, message: string): string {
  const parsed = z.uuid().safeParse(value);
  if (!parsed.success) throw new AppError("validation_error", message);
  return parsed.data;
}

function refresh(): void {
  revalidatePath("/dashboard/expenses");
  revalidatePath("/dashboard/hours");
  revalidatePath("/dashboard/finance");
  revalidatePath("/dashboard/services");
  // O gasto pode estar ligado a um serviço: a página do orçamento mostra o resultado.
  revalidatePath("/dashboard/quotes/[id]", "page");
}

export async function saveExpenseAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  try {
    const actor = await getActor();
    const input = parseExpenseForm(formData);
    const service = await getExpenseService();
    if (formData.get("expenseId")) {
      const expenseId = uuid(formData.get("expenseId"), "Gasto inválido");
      await service.update(actor, expenseId, input);
      await recordAudit({ companyId: actor.companyId, action: "expense.updated", entityType: "expense", entityId: expenseId });
    } else {
      const expenseId = await service.create(actor, input);
      await recordAudit({ companyId: actor.companyId, action: "expense.created", entityType: "expense", entityId: expenseId });
    }
    refresh();
    return { success: "Gasto salvo" };
  } catch (err) {
    return handleError(err);
  }
}

export async function deleteExpenseAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  try {
    const actor = await getActor();
    const expenseId = uuid(formData.get("expenseId"), "Gasto inválido");
    const service = await getExpenseService();
    await service.remove(actor, expenseId);
    await recordAudit({ companyId: actor.companyId, action: "expense.deleted", entityType: "expense", entityId: expenseId });
    refresh();
    return { success: "Gasto excluído" };
  } catch (err) {
    return handleError(err);
  }
}

export async function generateMonthExpensesAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  try {
    const actor = await getActor();
    const month = z.iso.date().parse(formData.get("month"));
    const service = await getExpenseService();
    const count = await service.generateMonth(actor, month);
    if (count > 0) {
      await recordAudit({ companyId: actor.companyId, action: "expense.generated", entityType: "expense", metadata: { month, count } });
    }
    refresh();
    return {
      success:
        count === 0
          ? "Nenhum lançamento novo: tudo deste mês já foi gerado."
          : count === 1
            ? "1 lançamento gerado"
            : `${count} lançamentos gerados`,
    };
  } catch (err) {
    return handleError(err);
  }
}

export async function saveExpenseTemplateAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  try {
    const actor = await getActor();
    const input = parseExpenseTemplateForm(formData);
    const templateId = formData.get("templateId") ? uuid(formData.get("templateId"), "Recorrência inválida") : null;
    const service = await getExpenseService();
    await service.saveTemplate(actor, templateId, input);
    await recordAudit({ companyId: actor.companyId, action: templateId ? "expense_template.updated" : "expense_template.created", entityType: "expense_template", entityId: templateId ?? undefined });
    refresh();
    return { success: "Recorrência salva" };
  } catch (err) {
    return handleError(err);
  }
}

export async function deleteExpenseTemplateAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  try {
    const actor = await getActor();
    const templateId = uuid(formData.get("templateId"), "Recorrência inválida");
    const service = await getExpenseService();
    await service.removeTemplate(actor, templateId);
    await recordAudit({ companyId: actor.companyId, action: "expense_template.deleted", entityType: "expense_template", entityId: templateId });
    refresh();
    return { success: "Recorrência excluída. O que já foi lançado continua." };
  } catch (err) {
    return handleError(err);
  }
}

export async function saveExpenseCategoryAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  try {
    const actor = await getActor();
    const name = categoryNameSchema.parse(formData.get("name") ?? "");
    const categoryId = formData.get("categoryId") ? uuid(formData.get("categoryId"), "Categoria inválida") : null;
    const service = await getExpenseService();
    await service.saveCategory(actor, categoryId, name);
    await recordAudit({ companyId: actor.companyId, action: categoryId ? "expense_category.updated" : "expense_category.created", entityType: "expense_category", entityId: categoryId ?? undefined });
    refresh();
    return { success: "Categoria salva" };
  } catch (err) {
    return handleError(err);
  }
}

export async function saveSupplierAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  try {
    const actor = await getActor();
    const input = parseSupplierForm(formData);
    const supplierId = formData.get("supplierId") ? uuid(formData.get("supplierId"), "Fornecedor inválido") : null;
    const service = await getExpenseService();
    await service.saveSupplier(actor, supplierId, input);
    await recordAudit({ companyId: actor.companyId, action: supplierId ? "supplier.updated" : "supplier.created", entityType: "supplier", entityId: supplierId ?? undefined });
    refresh();
    return { success: "Fornecedor salvo" };
  } catch (err) {
    return handleError(err);
  }
}

export async function deleteSupplierAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  try {
    const actor = await getActor();
    const supplierId = uuid(formData.get("supplierId"), "Fornecedor inválido");
    const service = await getExpenseService();
    await service.removeSupplier(actor, supplierId);
    await recordAudit({ companyId: actor.companyId, action: "supplier.deleted", entityType: "supplier", entityId: supplierId });
    refresh();
    return { success: "Fornecedor excluído" };
  } catch (err) {
    return handleError(err);
  }
}

export async function deleteExpenseCategoryAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  try {
    const actor = await getActor();
    const categoryId = uuid(formData.get("categoryId"), "Categoria inválida");
    const service = await getExpenseService();
    await service.removeCategory(actor, categoryId);
    await recordAudit({ companyId: actor.companyId, action: "expense_category.deleted", entityType: "expense_category", entityId: categoryId });
    refresh();
    return { success: "Categoria excluída" };
  } catch (err) {
    return handleError(err);
  }
}
