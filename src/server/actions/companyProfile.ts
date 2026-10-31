"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getActor } from "@/server/actor";
import { recordAudit } from "@/server/audit";
import { getCompanyProfileService } from "@/server/quotes";
import { companyProfileSchema } from "@/services/companyProfileService";
import { toActionError, type ActionState } from "./action-state";

export async function saveCompanyProfileAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await getActor();
    const input = companyProfileSchema.parse(Object.fromEntries(formData));
    const service = await getCompanyProfileService();
    await service.save(actor, input);
    await recordAudit({ companyId: actor.companyId, action: "company_profile.updated", entityType: "company", entityId: actor.companyId });
    revalidatePath("/dashboard/settings");
    return { success: "Dados da empresa salvos" };
  } catch (err) {
    if (err instanceof z.ZodError) return { error: err.issues[0]?.message ?? "Dados inválidos." };
    return toActionError(err);
  }
}
