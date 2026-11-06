"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getActor } from "@/server/actor";
import { recordAudit } from "@/server/audit";
import { getCompanyLogoService } from "@/server/companyLogo";
import { rejectInDemo } from "@/server/demo/mode";
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

/** Logo dos documentos. Chega em PNG, já reduzido no aparelho; o servidor confere tipo e tamanho. */
export async function uploadCompanyLogoAction(formData: FormData): Promise<ActionState> {
  try {
    await rejectInDemo();
    const actor = await getActor();
    const file = formData.get("logo");
    if (!(file instanceof File) || file.size === 0) return { error: "Escolha uma imagem." };
    await (await getCompanyLogoService()).upload(actor, new Uint8Array(await file.arrayBuffer()));
    await recordAudit({ companyId: actor.companyId, action: "company_profile.logo_updated", entityType: "company", entityId: actor.companyId });
    revalidatePath("/dashboard", "layout");
    return { success: "Logo salvo" };
  } catch (err) {
    return toActionError(err);
  }
}

export async function removeCompanyLogoAction(): Promise<ActionState> {
  try {
    await rejectInDemo();
    const actor = await getActor();
    await (await getCompanyLogoService()).remove(actor);
    await recordAudit({ companyId: actor.companyId, action: "company_profile.logo_removed", entityType: "company", entityId: actor.companyId });
    revalidatePath("/dashboard", "layout");
    return { success: "Logo removido" };
  } catch (err) {
    return toActionError(err);
  }
}
