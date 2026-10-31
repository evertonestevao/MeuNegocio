"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parseEmployeeForm } from "@/features/team/schemas";
import { AppError } from "@/lib/errors";
import { getActor } from "@/server/actor";
import { recordAudit } from "@/server/audit";
import { getEmployeeService } from "@/server/schedule";
import { toActionError, type ActionState } from "./action-state";

function handleError(err: unknown): ActionState {
  if (err instanceof z.ZodError) return { error: err.issues[0]?.message ?? "Dados inválidos." };
  return toActionError(err);
}

function employeeIdFrom(formData: FormData): string {
  const parsed = z.uuid().safeParse(formData.get("employeeId"));
  if (!parsed.success) throw new AppError("validation_error", "Pessoa inválida");
  return parsed.data;
}

// A auditoria registra só o fato: dados de pagamento não entram nela.
export async function saveEmployeeAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await getActor();
    const input = parseEmployeeForm(formData);
    const service = await getEmployeeService();
    if (formData.get("employeeId")) {
      const employeeId = employeeIdFrom(formData);
      await service.update(actor, employeeId, input);
      await recordAudit({ companyId: actor.companyId, action: "employee.updated", entityType: "employee", entityId: employeeId });
    } else {
      const employee = await service.create(actor, input);
      await recordAudit({ companyId: actor.companyId, action: "employee.created", entityType: "employee", entityId: employee.id });
    }
    revalidatePath("/dashboard/team");
    revalidatePath("/dashboard/schedule");
    return { success: "Cadastro salvo" };
  } catch (err) {
    return handleError(err);
  }
}

export async function deleteEmployeeAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await getActor();
    const employeeId = employeeIdFrom(formData);
    const service = await getEmployeeService();
    await service.remove(actor, employeeId);
    await recordAudit({ companyId: actor.companyId, action: "employee.deleted", entityType: "employee", entityId: employeeId });
    revalidatePath("/dashboard/team");
    return { success: "Cadastro excluído" };
  } catch (err) {
    return handleError(err);
  }
}
