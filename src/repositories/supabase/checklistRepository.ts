import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors";
import type { ChecklistRepository, ChecklistTemplates } from "@/services/checklistService";

function fail(error: { code?: string; message?: string }): never {
  if (error.code === "P0001") throw new AppError("conflict", error.message ?? "Operação recusada", error);
  if (error.code === "42501") throw new AppError("forbidden", "Sem permissão para esta ação", error);
  throw new AppError("internal_error", "Falha ao acessar os checklists", error);
}

export function createSupabaseChecklistRepository(client: SupabaseClient): ChecklistRepository {
  return {
    async list(companyId) {
      const { data, error } = await client.rpc("list_checklist_templates", { p_company_id: companyId });
      if (error) fail(error);
      return data as ChecklistTemplates;
    },

    async save(companyId, kind, labels) {
      const { error } = await client.rpc("save_checklist_template", { p_company_id: companyId, p_kind: kind, p_labels: labels });
      if (error) fail(error);
    },
  };
}
