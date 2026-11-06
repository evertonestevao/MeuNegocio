"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseCompanyProvisioningRepository } from "@/repositories/supabase/companyProvisioningRepository";
import { recordAudit } from "@/server/audit";
import { getCompanyTrustService } from "@/server/companyTrust";
import { requirePlatformAdmin } from "@/server/plans";
import { getSupabaseServerClient } from "@/server/supabase-server";
import { getSupabaseAdminClient } from "@/server/supabase-admin";
import { createCompanyProvisioningService, provisionCompanySchema } from "@/services/companyProvisioningService";
import { toActionError, type ActionState } from "./action-state";

export type ProvisionState = ActionState & { credentials?: { email: string; temporaryPassword: string } };

/** A senha só existe nesta resposta: não é gravada em lugar nenhum nem vai para log ou auditoria. */
export async function provisionCompanyAction(_prev: ProvisionState | undefined, formData: FormData): Promise<ProvisionState> {
  try {
    const adminId = await requirePlatformAdmin();
    const input = provisionCompanySchema.parse(Object.fromEntries(formData));
    const service = createCompanyProvisioningService({
      repo: createSupabaseCompanyProvisioningRepository(getSupabaseAdminClient()),
      generatePassword: () => randomBytes(12).toString("base64url"),
      randomSuffix: () => randomBytes(3).toString("hex"),
    });
    const credentials = await service.provision(input, adminId);
    revalidatePath("/admin/empresas");
    return { success: `Empresa ${input.companyName} criada`, credentials };
  } catch (err) {
    if (err instanceof z.ZodError) return { error: err.issues[0]?.message ?? "Dados inválidos." };
    return toActionError(err);
  }
}

/** Suspende ou reativa uma empresa, sempre com motivo. Fica no histórico da empresa como prova. */
export async function setCompanySuspensionAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  try {
    const adminId = await requirePlatformAdmin();
    const companyId = z.uuid().parse(formData.get("companyId"));
    const suspend = formData.get("suspend") === "1";
    const { data } = await (await getSupabaseServerClient()).auth.getUser();
    await getCompanyTrustService().setSuspension({ companyId, suspend, reason: formData.get("reason"), actorId: adminId, actorEmail: data.user?.email ?? "" });
    await recordAudit({ companyId, action: suspend ? "company.suspended" : "company.reactivated", entityType: "company", entityId: companyId });
    revalidatePath(`/admin/empresas/${companyId}`);
    revalidatePath("/admin/empresas");
    return { success: suspend ? "Empresa suspensa" : "Empresa reativada" };
  } catch (err) {
    if (err instanceof z.ZodError) return { error: "Empresa inválida." };
    return toActionError(err);
  }
}
