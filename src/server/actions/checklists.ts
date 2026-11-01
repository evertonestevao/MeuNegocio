"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { checklistLabelsSchema } from "@/features/work-orders/schemas";
import { getActor } from "@/server/actor";
import { recordAudit } from "@/server/audit";
import { getChecklistService } from "@/server/checklists";
import { toActionError, type ActionState } from "./action-state";

const kindSchema = z.enum(["assessment", "execution"]);

export async function saveChecklistTemplateAction(kindValue: unknown, labelsValue: unknown): Promise<ActionState> {
  try {
    const actor = await getActor();
    const kind = kindSchema.parse(kindValue);
    const labels = checklistLabelsSchema.parse(labelsValue);
    await (await getChecklistService()).save(actor, kind, labels);
    await recordAudit({ companyId: actor.companyId, action: "checklist_template.updated", entityType: "checklist_template", metadata: { kind } });
    revalidatePath("/dashboard/settings/checklists");
    revalidatePath("/dashboard/schedule");
    return { success: "Checklist salvo" };
  } catch (err) {
    if (err instanceof z.ZodError) return { error: err.issues[0]?.message ?? "Dados inválidos." };
    return toActionError(err);
  }
}
