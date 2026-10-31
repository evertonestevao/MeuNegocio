import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors";
import type { WorkOrderRepository } from "@/services/workOrderService";
import type { VisitSheet } from "@/types/workOrders";

function fail(error: { code?: string; message?: string } | null): never {
  // As funções do banco levantam P0001 com mensagem pensada para o usuário.
  if (error?.code === "P0001") throw new AppError("conflict", error.message ?? "Operação recusada", error);
  if (error?.code === "42501") throw new AppError("forbidden", "Sem permissão para esta ação", error);
  throw new AppError("internal_error", "Falha ao acessar a ordem de serviço", error);
}

export function createSupabaseWorkOrderRepository(client: SupabaseClient): WorkOrderRepository {
  return {
    async getSheet(companyId, visitId) {
      const { data, error } = await client.rpc("get_visit_sheet", { p_company_id: companyId, p_visit_id: visitId });
      if (error) fail(error);
      return data as VisitSheet | null;
    },

    async listMine(companyId, from, to) {
      const { data, error } = await client.rpc("list_my_visits", { p_company_id: companyId, p_from: from, p_to: to });
      if (error) fail(error);
      return (data ?? []) as VisitSheet[];
    },

    async start(companyId, visitId) {
      const { error } = await client.rpc("start_work_order", { p_company_id: companyId, p_visit_id: visitId });
      if (error) fail(error);
    },

    async save(companyId, visitId, { doneIds, report, startedTime }) {
      const { error } = await client.rpc("save_work_order", {
        p_company_id: companyId,
        p_visit_id: visitId,
        p_done_ids: doneIds,
        p_report: report,
        p_started_time: startedTime,
      });
      if (error) fail(error);
    },

    async addPhoto(companyId, visitId, path, caption) {
      const { error } = await client.rpc("add_work_order_photo", {
        p_company_id: companyId,
        p_visit_id: visitId,
        p_path: path,
        p_caption: caption,
      });
      if (error) fail(error);
    },

    async removePhoto(companyId, visitId, photoId) {
      const { data, error } = await client.rpc("remove_work_order_photo", {
        p_company_id: companyId,
        p_visit_id: visitId,
        p_photo_id: photoId,
      });
      if (error) fail(error);
      return data as string;
    },

    async complete(companyId, visitId, { signaturePath, signatureName, finishedTime }) {
      const { error } = await client.rpc("complete_work_order", {
        p_company_id: companyId,
        p_visit_id: visitId,
        p_signature_path: signaturePath,
        p_signature_name: signatureName,
        p_finished_time: finishedTime,
      });
      if (error) fail(error);
    },
  };
}
