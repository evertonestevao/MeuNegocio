import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors";
import type { HoursRepository } from "@/services/hoursService";
import type { HoursMonth } from "@/types/finance";

function fail(error: { code?: string; message?: string } | null): never {
  // As funções do banco levantam P0001 com mensagem pensada para o usuário.
  if (error?.code === "P0001") throw new AppError("conflict", error.message ?? "Operação recusada", error);
  if (error?.code === "42501") throw new AppError("forbidden", "Sem permissão para esta ação", error);
  throw new AppError("internal_error", "Falha ao acessar as horas", error);
}

export function createSupabaseHoursRepository(client: SupabaseClient): HoursRepository {
  return {
    async getMonth(companyId, month) {
      const { data, error } = await client.rpc("get_hours_month", { p_company_id: companyId, p_month: month });
      if (error) fail(error);
      return data as HoursMonth;
    },

    async save(companyId, entryId, input) {
      const { data, error } = await client.rpc("save_time_entry", {
        p_company_id: companyId,
        p_entry_id: entryId,
        p_employee_id: input.employeeId,
        p_entry_date: input.entryDate,
        p_starts_at: input.startsAt,
        p_ends_at: input.endsAt,
        p_break_minutes: input.breakMinutes,
        p_visit_id: input.visitId,
        p_client_id: input.clientId,
        p_notes: input.notes,
      });
      if (error) fail(error);
      return data as string;
    },

    async setStatus(companyId, entryId, status) {
      const { error } = await client.rpc("set_time_entry_status", { p_company_id: companyId, p_entry_id: entryId, p_status: status });
      if (error) fail(error);
    },

    async remove(companyId, entryId) {
      const { error } = await client.rpc("remove_time_entry", { p_company_id: companyId, p_entry_id: entryId });
      if (error) fail(error);
    },

    async setDismissed(companyId, visitId, employeeId, dismissed) {
      const { error } = await client.rpc("set_suggestion_dismissed", {
        p_company_id: companyId,
        p_visit_id: visitId,
        p_employee_id: employeeId,
        p_dismissed: dismissed,
      });
      if (error) fail(error);
    },

    async close(companyId, employeeId, month) {
      const { data, error } = await client.rpc("close_contractor_month", {
        p_company_id: companyId,
        p_employee_id: employeeId,
        p_month: month,
      });
      if (error) fail(error);
      return data as string;
    },
  };
}
