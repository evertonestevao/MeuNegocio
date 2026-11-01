import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors";
import type { VisitRepository } from "@/services/visitService";
import type { QuotePickerOption, Visit, VisitBusySlot, VisitListItem } from "@/types/database";

function fail(error: { code?: string; message?: string } | null): never {
  // As funções do banco levantam P0001 com mensagem pensada para o usuário.
  if (error?.code === "P0001") throw new AppError("conflict", error.message ?? "Operação recusada", error);
  if (error?.code === "42501") throw new AppError("forbidden", "Sem permissão para esta ação", error);
  throw new AppError("internal_error", "Falha ao acessar a agenda", error);
}

/** Leitura com RLS; toda escrita passa pelas funções do banco. */
export function createSupabaseVisitRepository(client: SupabaseClient): VisitRepository {
  return {
    async list(companyId, { from, to, clientId, quoteId, kind }) {
      let query = client
        .from("visits")
        .select(
          "id, company_id, client_id, location_id, quote_id, kind, visit_date, starts_at, ends_at, status, notes, checklist_labels, client:clients(name), location:client_locations(name), team:visit_employees(employee:employees(id, name))",
        )
        .eq("company_id", companyId)
        .is("deleted_at", null);
      if (from) query = query.gte("visit_date", from);
      if (to) query = query.lte("visit_date", to);
      if (clientId) query = query.eq("client_id", clientId);
      if (quoteId) query = query.eq("quote_id", quoteId);
      if (kind) query = query.eq("kind", kind);
      const { data, error } = await query.order("visit_date").order("starts_at");
      if (error) fail(error);
      type Row = Visit & {
        client: { name: string } | null;
        location: { name: string } | null;
        team: { employee: { id: string; name: string } | null }[];
      };
      return ((data ?? []) as unknown as Row[]).map(({ client: related, location, team, ...row }): VisitListItem => ({
        ...row,
        client_name: related?.name ?? "",
        location_name: location?.name ?? "",
        employees: team.flatMap(({ employee }) => (employee ? [employee] : [])),
      }));
    },

    async listBusySlots(companyId, date) {
      const { data, error } = await client
        .from("visit_employees")
        .select("visit_id, employee_id, visit:visits!inner(visit_date, starts_at, ends_at, client:clients(name))")
        .eq("company_id", companyId)
        .eq("blocks_schedule", true)
        .eq("visit.visit_date", date);
      if (error) fail(error);
      type Row = {
        visit_id: string;
        employee_id: string;
        visit: { visit_date: string; starts_at: string; ends_at: string; client: { name: string } | null };
      };
      return ((data ?? []) as unknown as Row[]).map((row): VisitBusySlot => ({
        visit_id: row.visit_id,
        employee_id: row.employee_id,
        visit_date: row.visit.visit_date,
        starts_at: row.visit.starts_at,
        ends_at: row.visit.ends_at,
        client_name: row.visit.client?.name ?? "",
      }));
    },

    async listQuotePicker(companyId) {
      const { data, error } = await client
        .from("quotes")
        .select("id, number, title, client_id, location_id, status")
        .eq("company_id", companyId)
        .in("status", ["approved", "closed"])
        .not("client_id", "is", null)
        .is("deleted_at", null)
        .order("number", { ascending: false });
      if (error) fail(error);
      return (data ?? []) as QuotePickerOption[];
    },

    async save(companyId, visitId, input) {
      const { data, error } = await client.rpc("save_visit", {
        p_company_id: companyId,
        p_visit_id: visitId,
        p_client_id: input.clientId,
        p_location_id: input.locationId,
        p_quote_id: input.quoteId,
        p_kind: input.kind,
        p_visit_date: input.visitDate,
        p_starts_at: input.startsAt,
        p_ends_at: input.endsAt,
        p_status: input.status,
        p_notes: input.notes,
        p_employee_ids: input.employeeIds,
        p_checklist: input.checklist,
      });
      if (error) fail(error);
      return data as string;
    },

    async softDelete(companyId, visitId) {
      const { error } = await client.rpc("delete_visit", { p_company_id: companyId, p_visit_id: visitId });
      if (error) fail(error);
    },
  };
}
