"use server";

import { revalidatePath } from "next/cache";
import { firstValidationMessage, parsePlanForm, planCodeSchema } from "@/features/plans/schemas";
import { AppError } from "@/lib/errors";
import { getPlanAdminService, requirePlatformAdmin } from "@/server/plans";
import { toActionError, type ActionState } from "./action-state";

function refresh(): void {
  revalidatePath("/admin/planos");
  revalidatePath("/dashboard/billing");
  revalidatePath("/");
}

function handleError(err: unknown): ActionState {
  const message = firstValidationMessage(err);
  return message ? { error: message } : toActionError(err);
}

export async function createPlanAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  try {
    const adminId = await requirePlatformAdmin();
    const code = planCodeSchema.parse(formData.get("code"));
    await getPlanAdminService().create(code, parsePlanForm(formData), adminId);
    refresh();
    return { success: "Plano criado" };
  } catch (err) {
    return handleError(err);
  }
}

export async function updatePlanAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  try {
    const adminId = await requirePlatformAdmin();
    const planId = formData.get("planId");
    if (typeof planId !== "string") throw new AppError("validation_error", "Plano não informado");
    await getPlanAdminService().update(planId, parsePlanForm(formData), adminId);
    refresh();
    return { success: "Plano salvo" };
  } catch (err) {
    return handleError(err);
  }
}

export async function setPlanActiveAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  try {
    const adminId = await requirePlatformAdmin();
    const planId = formData.get("planId");
    if (typeof planId !== "string") throw new AppError("validation_error", "Plano não informado");
    const isActive = formData.get("isActive") === "true";
    await getPlanAdminService().setActive(planId, isActive, adminId);
    refresh();
    return { success: isActive ? "Plano ativado" : "Plano desativado" };
  } catch (err) {
    return toActionError(err);
  }
}
