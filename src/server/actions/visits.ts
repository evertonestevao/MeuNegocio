"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parseVisitForm } from "@/features/visits/schemas";
import { AppError } from "@/lib/errors";
import { getActor } from "@/server/actor";
import { recordAudit } from "@/server/audit";
import { getVisitService } from "@/server/schedule";
import type { VisitConflict } from "@/services/visitService";
import { toActionError, type ActionState } from "./action-state";

function handleError(err: unknown): ActionState {
  if (err instanceof z.ZodError) return { error: err.issues[0]?.message ?? "Dados inválidos." };
  return toActionError(err);
}

function visitIdFrom(formData: FormData): string {
  const parsed = z.uuid().safeParse(formData.get("visitId"));
  if (!parsed.success) throw new AppError("validation_error", "Visita inválida");
  return parsed.data;
}

function refresh(): void {
  revalidatePath("/dashboard/schedule");
  revalidatePath("/dashboard/team");
  revalidatePath("/dashboard/clients", "layout");
  revalidatePath("/dashboard/quotes", "layout");
}

export async function saveVisitAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await getActor();
    const input = parseVisitForm(formData);
    const existingId = formData.get("visitId") ? visitIdFrom(formData) : null;
    const service = await getVisitService();
    const visitId = await service.save(actor, existingId, input);
    await recordAudit({
      companyId: actor.companyId,
      action: existingId ? "visit.updated" : "visit.created",
      entityType: "visit",
      entityId: visitId,
      metadata: { status: input.status, visit_date: input.visitDate },
    });
    refresh();
    return { success: "Visita salva" };
  } catch (err) {
    return handleError(err);
  }
}

export async function deleteVisitAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await getActor();
    const visitId = visitIdFrom(formData);
    const service = await getVisitService();
    await service.remove(actor, visitId);
    await recordAudit({ companyId: actor.companyId, action: "visit.deleted", entityType: "visit", entityId: visitId });
    refresh();
    return { success: "Visita excluída" };
  } catch (err) {
    return handleError(err);
  }
}

const conflictQuerySchema = z.object({
  visitId: z.uuid().nullable(),
  visitDate: z.iso.date(),
  startsAt: z.string().regex(/^\d{2}:\d{2}$/),
  endsAt: z.string().regex(/^\d{2}:\d{2}$/),
});

/** Aviso ao vivo no formulário. Só orienta: quem decide é o banco, ao salvar. */
export async function listVisitConflictsAction(query: unknown): Promise<VisitConflict[]> {
  const parsed = conflictQuerySchema.safeParse(query);
  if (!parsed.success) return [];
  try {
    const actor = await getActor();
    const service = await getVisitService();
    return await service.listConflicts(actor, parsed.data);
  } catch {
    return [];
  }
}
