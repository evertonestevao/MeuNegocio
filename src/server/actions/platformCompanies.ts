"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseCompanyProvisioningRepository } from "@/repositories/supabase/companyProvisioningRepository";
import { requirePlatformAdmin } from "@/server/plans";
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
