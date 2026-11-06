"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { todayInTimezone } from "@/lib/dates";
import { getActor } from "@/server/actor";
import { recordAudit } from "@/server/audit";
import { getCompanyProfileService } from "@/server/quotes";
import { getReceivableService } from "@/server/receivables";
import { receiveInstallmentSchema, rescheduleInstallmentSchema } from "@/services/receivableService";
import type { ReceiptData } from "@/types/finance";
import { toActionError, type ActionState } from "./action-state";

function handleError(err: unknown): ActionState {
  if (err instanceof z.ZodError) return { error: err.issues[0]?.message ?? "Dados inválidos." };
  return toActionError(err);
}

function refresh(quoteId: string | null): void {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/finance");
  revalidatePath("/dashboard/finance/recebimentos");
  if (quoteId) revalidatePath(`/dashboard/quotes/${quoteId}`);
}

const field = (formData: FormData, name: string) => String(formData.get(name) ?? "");

function quoteIdFrom(formData: FormData): string | null {
  const parsed = z.uuid().safeParse(formData.get("quoteId"));
  return parsed.success ? parsed.data : null;
}

export async function receiveInstallmentAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  try {
    const actor = await getActor();
    const input = receiveInstallmentSchema.parse({
      id: field(formData, "receivableId"),
      receivedOn: field(formData, "receivedOn"),
      receivedCents: field(formData, "receivedAmount"),
      method: field(formData, "method"),
      restDueDate: field(formData, "restDueDate"),
    });
    const { timezone } = await (await getCompanyProfileService()).get(actor.companyId);
    await (await getReceivableService()).receive(actor, input, todayInTimezone(timezone));
    await recordAudit({
      companyId: actor.companyId,
      action: "receivable.received",
      entityType: "receivable",
      entityId: input.id,
      metadata: { received_cents: input.receivedCents, received_on: input.receivedOn },
    });
    refresh(quoteIdFrom(formData));
    return { success: "Recebimento registrado" };
  } catch (err) {
    return handleError(err);
  }
}

export async function undoReceiveInstallmentAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  try {
    const actor = await getActor();
    const id = z.uuid().safeParse(formData.get("receivableId"));
    if (!id.success) throw new AppError("validation_error", "Parcela inválida.");
    await (await getReceivableService()).undoReceive(actor, id.data);
    await recordAudit({ companyId: actor.companyId, action: "receivable.receive_undone", entityType: "receivable", entityId: id.data });
    refresh(quoteIdFrom(formData));
    return { success: "A parcela voltou para a receber" };
  } catch (err) {
    return handleError(err);
  }
}

export async function rescheduleInstallmentAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  try {
    const actor = await getActor();
    const input = rescheduleInstallmentSchema.parse({
      id: field(formData, "receivableId"),
      dueDate: field(formData, "dueDate"),
      method: field(formData, "method"),
    });
    await (await getReceivableService()).reschedule(actor, input);
    await recordAudit({
      companyId: actor.companyId,
      action: "receivable.rescheduled",
      entityType: "receivable",
      entityId: input.id,
      metadata: { due_date: input.dueDate },
    });
    refresh(quoteIdFrom(formData));
    return { success: "Parcela alterada" };
  } catch (err) {
    return handleError(err);
  }
}

/** Dados do recibo de uma parcela recebida; o PDF é montado no navegador. */
export async function getReceiptAction(receivableId: string): Promise<{ receipt?: ReceiptData; error?: string }> {
  try {
    const actor = await getActor();
    const id = z.uuid().safeParse(receivableId);
    if (!id.success) throw new AppError("validation_error", "Parcela inválida.");
    return { receipt: await (await getReceivableService()).getReceipt(actor, id.data) };
  } catch (err) {
    return { error: toActionError(err).error };
  }
}
