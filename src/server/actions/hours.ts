"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parseTimeEntryForm } from "@/features/hours/schemas";
import { AppError } from "@/lib/errors";
import { getActor } from "@/server/actor";
import { recordAudit } from "@/server/audit";
import { getHoursService } from "@/server/finance";
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
  revalidatePath("/dashboard/hours");
  revalidatePath("/dashboard/expenses");
}

export async function saveTimeEntryAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  try {
    const actor = await getActor();
    const input = parseTimeEntryForm(formData);
    const existing = formData.get("entryId") ? uuid(formData.get("entryId"), "Apontamento inválido") : null;
    const service = await getHoursService();
    const entryId = await service.save(actor, existing, input);
    await recordAudit({ companyId: actor.companyId, action: existing ? "time_entry.updated" : "time_entry.created", entityType: "time_entry", entityId: entryId });
    refresh();
    return { success: "Horas salvas" };
  } catch (err) {
    return handleError(err);
  }
}

export async function setTimeEntryStatusAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  try {
    const actor = await getActor();
    const entryId = uuid(formData.get("entryId"), "Apontamento inválido");
    const status = z.enum(["pending", "approved"]).parse(formData.get("status"));
    const service = await getHoursService();
    await service.setStatus(actor, entryId, status);
    await recordAudit({ companyId: actor.companyId, action: `time_entry.${status}`, entityType: "time_entry", entityId: entryId });
    refresh();
    return { success: status === "approved" ? "Horas aprovadas" : "Horas voltaram para pendente" };
  } catch (err) {
    return handleError(err);
  }
}

export async function removeTimeEntryAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  try {
    const actor = await getActor();
    const entryId = uuid(formData.get("entryId"), "Apontamento inválido");
    const service = await getHoursService();
    await service.remove(actor, entryId);
    await recordAudit({ companyId: actor.companyId, action: "time_entry.deleted", entityType: "time_entry", entityId: entryId });
    refresh();
    return { success: "Horas retiradas" };
  } catch (err) {
    return handleError(err);
  }
}

export async function setSuggestionDismissedAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  try {
    const actor = await getActor();
    const visitId = uuid(formData.get("visitId"), "Visita inválida");
    const employeeId = uuid(formData.get("employeeId"), "Pessoa inválida");
    const dismissed = formData.get("dismissed") === "true";
    const service = await getHoursService();
    await service.setDismissed(actor, visitId, employeeId, dismissed);
    await recordAudit({
      companyId: actor.companyId,
      action: dismissed ? "time_suggestion.dismissed" : "time_suggestion.restored",
      entityType: "visit",
      entityId: visitId,
      metadata: { employee_id: employeeId },
    });
    refresh();
    return { success: dismissed ? "Retirado do período" : "Incluído no período" };
  } catch (err) {
    return handleError(err);
  }
}

export async function closeContractorMonthAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  try {
    const actor = await getActor();
    const employeeId = uuid(formData.get("employeeId"), "Pessoa inválida");
    const month = z.iso.date().parse(formData.get("month"));
    const service = await getHoursService();
    const expenseId = await service.close(actor, employeeId, month);
    await recordAudit({
      companyId: actor.companyId,
      action: "time_entry.month_closed",
      entityType: "expense",
      entityId: expenseId,
      metadata: { employee_id: employeeId, month },
    });
    refresh();
    return { success: "Mês fechado e gasto lançado" };
  } catch (err) {
    return handleError(err);
  }
}
