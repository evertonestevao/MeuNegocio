import type { SupabaseClient } from "@supabase/supabase-js";
import type { EmployeeInput } from "@/features/team/schemas";
import { AppError } from "@/lib/errors";
import type { EmployeeRepository, UpcomingVisitRow } from "@/services/employeeService";
import type { Employee, EmployeePaymentDetails } from "@/types/database";

function fail(error: { code?: string; message?: string } | null): never {
  // Vínculo com usuário de fora da empresa, recusado pelo gatilho.
  if (error?.code === "P0001") throw new AppError("conflict", error.message ?? "Operação recusada", error);
  // Índice único: o usuário já está vinculado a outra pessoa da equipe.
  if (error?.code === "23505") throw new AppError("conflict", "Este usuário já está vinculado a outra pessoa da equipe.", error);
  throw new AppError("internal_error", "Falha ao acessar a equipe", error);
}

const EMPLOYEE_COLUMNS = "id, company_id, name, job_title, active, user_id";

export function createSupabaseEmployeeRepository(client: SupabaseClient): EmployeeRepository {
  function detailColumns(companyId: string, employeeId: string, input: EmployeeInput) {
    return {
      company_id: companyId,
      employee_id: employeeId,
      phone: input.phone,
      contract_type: input.contractType,
      hourly_cost_cents: input.hourlyCostCents,
      hourly_pay_cents: input.hourlyPayCents,
      legal_name: input.legalName,
      tax_id: input.taxId,
      pix_key: input.pixKey,
    };
  }

  return {
    async list(companyId) {
      const { data, error } = await client
        .from("employees")
        .select(EMPLOYEE_COLUMNS)
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("name");
      if (error) fail(error);
      return (data ?? []) as Employee[];
    },

    async get(companyId, employeeId) {
      const { data, error } = await client
        .from("employees")
        .select(EMPLOYEE_COLUMNS)
        .eq("company_id", companyId)
        .eq("id", employeeId)
        .is("deleted_at", null)
        .maybeSingle<Employee>();
      if (error) fail(error);
      return data;
    },

    async listDetails(companyId) {
      const { data, error } = await client
        .from("employee_payment_details")
        .select("employee_id, phone, contract_type, hourly_cost_cents, hourly_pay_cents, legal_name, tax_id, pix_key")
        .eq("company_id", companyId)
        .is("deleted_at", null);
      if (error) fail(error);
      return (data ?? []) as EmployeePaymentDetails[];
    },

    async listUpcomingVisits(companyId, fromDate) {
      const { data, error } = await client
        .from("visit_employees")
        .select("employee_id, visit:visits!inner(visit_date, starts_at, status, deleted_at, client:clients(name))")
        .eq("company_id", companyId)
        .eq("blocks_schedule", true)
        .gte("visit.visit_date", fromDate);
      if (error) fail(error);
      type Row = {
        employee_id: string;
        visit: { visit_date: string; starts_at: string; client: { name: string } | null };
      };
      return ((data ?? []) as unknown as Row[])
        .map(
          (row): UpcomingVisitRow => ({
            employee_id: row.employee_id,
            visit_date: row.visit.visit_date,
            starts_at: row.visit.starts_at,
            client_name: row.visit.client?.name ?? "",
          }),
        )
        .sort((a, b) => `${a.visit_date}${a.starts_at}`.localeCompare(`${b.visit_date}${b.starts_at}`));
    },

    async insert(companyId, input) {
      const { data, error } = await client
        .from("employees")
        .insert({ company_id: companyId, name: input.name, job_title: input.jobTitle, active: input.active, user_id: input.userId })
        .select(EMPLOYEE_COLUMNS)
        .single<Employee>();
      if (error) fail(error);
      const { error: detailsError } = await client
        .from("employee_payment_details")
        .insert(detailColumns(companyId, data.id, input));
      if (detailsError) fail(detailsError);
      return data;
    },

    async update(companyId, employeeId, input) {
      const { error } = await client
        .from("employees")
        .update({ name: input.name, job_title: input.jobTitle, active: input.active, user_id: input.userId })
        .eq("company_id", companyId)
        .eq("id", employeeId)
        .is("deleted_at", null);
      if (error) fail(error);
      const { error: detailsError } = await client
        .from("employee_payment_details")
        .upsert(detailColumns(companyId, employeeId, input));
      if (detailsError) fail(detailsError);
    },

    async softDelete(companyId, employeeId) {
      const { error } = await client
        .from("employees")
        .update({ deleted_at: new Date().toISOString(), user_id: null })
        .eq("company_id", companyId)
        .eq("id", employeeId)
        .is("deleted_at", null);
      if (error) fail(error);
    },

    async hasHistory(companyId, employeeId) {
      const counts = await Promise.all([
        client.from("visit_employees").select("visit_id", { count: "exact", head: true }).eq("company_id", companyId).eq("employee_id", employeeId),
        client.from("time_entries").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("employee_id", employeeId).is("deleted_at", null),
        client.from("expenses").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("employee_id", employeeId).is("deleted_at", null),
        client.from("expense_templates").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("employee_id", employeeId).is("deleted_at", null),
      ]);
      for (const { error } of counts) if (error) fail(error);
      return counts.some(({ count }) => (count ?? 0) > 0);
    },
  };
}
