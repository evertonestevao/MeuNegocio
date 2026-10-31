"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { completeWorkOrderSchema, photoCaptionSchema, saveWorkOrderSchema } from "@/features/work-orders/schemas";
import { AppError } from "@/lib/errors";
import { getActor } from "@/server/actor";
import { recordAudit } from "@/server/audit";
import { getWorkOrderService } from "@/server/workOrders";
import { toActionError, type ActionState } from "./action-state";

function handleError(err: unknown): ActionState {
  if (err instanceof z.ZodError) return { error: err.issues[0]?.message ?? "Dados inválidos." };
  return toActionError(err);
}

function refresh(visitId: string): void {
  revalidatePath(`/dashboard/work-orders/${visitId}`);
  revalidatePath("/dashboard/my-visits");
  revalidatePath("/dashboard/schedule");
}

function uuid(value: unknown, message: string): string {
  const parsed = z.uuid().safeParse(value);
  if (!parsed.success) throw new AppError("validation_error", message);
  return parsed.data;
}

async function fileBytes(formData: FormData, key: string, message: string): Promise<Uint8Array> {
  const file = formData.get(key);
  if (!(file instanceof File) || file.size === 0) throw new AppError("validation_error", message);
  return new Uint8Array(await file.arrayBuffer());
}

export async function startWorkOrderAction(visitIdValue: string): Promise<ActionState> {
  try {
    const actor = await getActor();
    const visitId = uuid(visitIdValue, "Visita inválida");
    const service = await getWorkOrderService();
    await service.start(actor, visitId);
    await recordAudit({ companyId: actor.companyId, action: "work_order.started", entityType: "visit", entityId: visitId });
    refresh(visitId);
    return { success: "Ordem de serviço iniciada" };
  } catch (err) {
    return handleError(err);
  }
}

export async function saveWorkOrderAction(visitIdValue: string, input: unknown): Promise<ActionState> {
  try {
    const actor = await getActor();
    const visitId = uuid(visitIdValue, "Visita inválida");
    const service = await getWorkOrderService();
    await service.save(actor, visitId, saveWorkOrderSchema.parse(input));
    refresh(visitId);
    return { success: "Salvo" };
  } catch (err) {
    return handleError(err);
  }
}

export async function addWorkOrderPhotoAction(formData: FormData): Promise<ActionState> {
  try {
    const actor = await getActor();
    const visitId = uuid(formData.get("visitId"), "Visita inválida");
    const bytes = await fileBytes(formData, "photo", "Escolha uma foto.");
    const caption = photoCaptionSchema.parse(formData.get("caption") ?? "");
    const service = await getWorkOrderService();
    await service.addPhoto(actor, visitId, bytes, caption);
    await recordAudit({ companyId: actor.companyId, action: "work_order.photo_added", entityType: "visit", entityId: visitId });
    refresh(visitId);
    return { success: "Foto adicionada" };
  } catch (err) {
    return handleError(err);
  }
}

export async function removeWorkOrderPhotoAction(visitIdValue: string, photoIdValue: string): Promise<ActionState> {
  try {
    const actor = await getActor();
    const visitId = uuid(visitIdValue, "Visita inválida");
    const photoId = uuid(photoIdValue, "Foto inválida");
    const service = await getWorkOrderService();
    await service.removePhoto(actor, visitId, photoId);
    await recordAudit({ companyId: actor.companyId, action: "work_order.photo_removed", entityType: "visit", entityId: visitId });
    refresh(visitId);
    return { success: "Foto removida" };
  } catch (err) {
    return handleError(err);
  }
}

export async function completeWorkOrderAction(formData: FormData): Promise<ActionState> {
  try {
    const actor = await getActor();
    const visitId = uuid(formData.get("visitId"), "Visita inválida");
    const input = completeWorkOrderSchema.parse({
      signatureName: formData.get("signatureName"),
      startedTime: formData.get("startedTime"),
      finishedTime: formData.get("finishedTime"),
    });
    const signature = await fileBytes(formData, "signature", "Peça a assinatura do cliente.");
    const service = await getWorkOrderService();
    await service.save(actor, visitId, saveWorkOrderSchema.parse({
      doneIds: formData.getAll("doneIds").map(String),
      report: formData.get("report") ?? "",
      startedTime: input.startedTime,
    }));
    await service.complete(actor, visitId, { signature, signatureName: input.signatureName, finishedTime: input.finishedTime });
    await recordAudit({ companyId: actor.companyId, action: "work_order.completed", entityType: "visit", entityId: visitId });
    refresh(visitId);
    return { success: "Ordem de serviço concluída" };
  } catch (err) {
    return handleError(err);
  }
}
