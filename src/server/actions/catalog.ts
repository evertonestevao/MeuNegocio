"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parseCatalogForm } from "@/features/catalog/schemas";
import { AppError } from "@/lib/errors";
import { getActor } from "@/server/actor";
import { recordAudit } from "@/server/audit";
import { getCatalogService } from "@/server/quotes";
import { toActionError, type ActionState } from "./action-state";

function handleError(err: unknown): ActionState {
  if (err instanceof z.ZodError) return { error: err.issues[0]?.message ?? "Dados inválidos." };
  return toActionError(err);
}

function itemIdFrom(formData: FormData): string {
  const parsed = z.uuid().safeParse(formData.get("itemId"));
  if (!parsed.success) throw new AppError("validation_error", "Item inválido");
  return parsed.data;
}

export async function saveCatalogItemAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await getActor();
    const input = parseCatalogForm(formData);
    const service = await getCatalogService();
    if (formData.get("itemId")) {
      const itemId = itemIdFrom(formData);
      await service.update(actor, itemId, input);
      await recordAudit({ companyId: actor.companyId, action: "catalog_item.updated", entityType: "catalog_item", entityId: itemId });
    } else {
      const item = await service.create(actor, input);
      await recordAudit({ companyId: actor.companyId, action: "catalog_item.created", entityType: "catalog_item", entityId: item.id });
    }
    revalidatePath("/dashboard/catalog");
    return { success: "Item salvo" };
  } catch (err) {
    return handleError(err);
  }
}

export async function deleteCatalogItemAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await getActor();
    const itemId = itemIdFrom(formData);
    const service = await getCatalogService();
    await service.remove(actor, itemId);
    await recordAudit({ companyId: actor.companyId, action: "catalog_item.deleted", entityType: "catalog_item", entityId: itemId });
    revalidatePath("/dashboard/catalog");
    return { success: "Item excluído" };
  } catch (err) {
    return handleError(err);
  }
}
