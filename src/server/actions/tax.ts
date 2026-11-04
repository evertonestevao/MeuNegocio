"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getActor } from "@/server/actor";
import { recordAudit } from "@/server/audit";
import { getTaxService } from "@/server/tax";
import { monthlyRevenuesSchema, taxSettingsSchema } from "@/services/taxService";
import { toActionError, type ActionState } from "./action-state";

function handleError(err: unknown): ActionState {
  if (err instanceof z.ZodError) return { error: err.issues[0]?.message ?? "Dados inválidos." };
  return toActionError(err);
}

function refresh(): void {
  revalidatePath("/dashboard/settings/impostos");
  revalidatePath("/dashboard/services");
  revalidatePath("/dashboard/finance");
}

export async function saveTaxSettingsAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  try {
    const actor = await getActor();
    const input = taxSettingsSchema.parse(Object.fromEntries(formData));
    await (await getTaxService()).saveSettings(actor, input);
    await recordAudit({
      companyId: actor.companyId,
      action: "company.tax_updated",
      entityType: "company",
      entityId: actor.companyId,
      metadata: { regime: input.taxRegime, auto: input.taxRateAuto, annex: input.simplesAnnex },
    });
    refresh();
    return { success: "Impostos salvos" };
  } catch (err) {
    return handleError(err);
  }
}

/** Campos "revenue-AAAA-MM-01" do formulário dos meses da base. */
export async function saveMonthlyRevenuesAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  try {
    const actor = await getActor();
    const entries = monthlyRevenuesSchema.parse(
      [...formData.entries()]
        .filter(([name]) => name.startsWith("revenue-"))
        .map(([name, value]) => ({ month: name.slice("revenue-".length), amount: String(value) })),
    );
    await (await getTaxService()).saveMonthlyRevenues(actor, entries);
    // Faturamento é dado sensível: a auditoria registra só que mudou.
    await recordAudit({ companyId: actor.companyId, action: "company.revenue_informed", entityType: "company", entityId: actor.companyId });
    refresh();
    return { success: "Faturamento salvo" };
  } catch (err) {
    return handleError(err);
  }
}
