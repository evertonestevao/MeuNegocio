import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors";
import type { LaborEntry, LaborRate, PlannedLine, ServiceCostRepository, ServiceQuoteRow, ServiceVisit } from "@/services/serviceCostService";
import type { Expense } from "@/types/finance";

function fail(error: unknown): never {
  throw new AppError("internal_error", "Falha ao ler os custos do serviço", error);
}

const minutesOf = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

export function createSupabaseServiceCostRepository(client: SupabaseClient): ServiceCostRepository {
  return {
    async listServiceQuotes(companyId, stage) {
      let query = client
        .from("quotes")
        .select("id, number, title, total_cents, approved_at, closed_at, client:clients(name)")
        .eq("company_id", companyId)
        .eq("status", stage === "open" ? "approved" : "closed")
        .is("deleted_at", null);
      query = stage === "open" ? query.order("approved_at", { ascending: true }) : query.order("closed_at", { ascending: false }).limit(60);
      const { data, error } = await query;
      if (error) fail(error);
      type Row = Omit<ServiceQuoteRow, "client_name"> & { client: { name: string } | null };
      return ((data ?? []) as unknown as Row[]).map(({ client: related, ...row }) => ({ ...row, client_name: related?.name ?? null }));
    },

    async listServiceVisits(companyId, quoteIds) {
      const { data, error } = await client
        .from("visits")
        .select("quote_id, visit_date, starts_at, status")
        .eq("company_id", companyId)
        .in("quote_id", quoteIds)
        .is("deleted_at", null);
      if (error) fail(error);
      return (data ?? []) as ServiceVisit[];
    },

    async listPlannedLines(companyId, quoteIds) {
      const { data, error } = await client
        .from("quote_items")
        .select("quote_id, pricing_mode, quantity, people, catalog_item_id")
        .eq("company_id", companyId)
        .in("quote_id", quoteIds)
        .is("deleted_at", null);
      if (error) fail(error);
      type Row = { quote_id: string; pricing_mode: "fixed" | "hourly"; quantity: number; people: number; catalog_item_id: string | null };
      const rows = (data ?? []) as Row[];
      const catalogIds = [...new Set(rows.flatMap((row) => (row.catalog_item_id ? [row.catalog_item_id] : [])))];
      const costs = new Map<string, number | null>();
      if (catalogIds.length > 0) {
        const result = await client
          .from("catalog_item_costs")
          .select("catalog_item_id, cost_cents")
          .eq("company_id", companyId)
          .in("catalog_item_id", catalogIds)
          .is("deleted_at", null);
        if (result.error) fail(result.error);
        for (const row of (result.data ?? []) as { catalog_item_id: string; cost_cents: number | null }[]) costs.set(row.catalog_item_id, row.cost_cents);
      }
      return rows.map(
        (row): PlannedLine => ({
          quote_id: row.quote_id,
          pricingMode: row.pricing_mode,
          quantity: Number(row.quantity),
          people: row.people,
          costCents: row.catalog_item_id ? (costs.get(row.catalog_item_id) ?? null) : null,
        }),
      );
    },

    async listQuoteOptions(companyId) {
      const { data, error } = await client
        .from("quotes")
        .select("id, number, title, client:clients(name)")
        .eq("company_id", companyId)
        .in("status", ["approved", "closed"])
        .is("deleted_at", null)
        .order("number", { ascending: false })
        .limit(300);
      if (error) fail(error);
      type Row = { id: string; number: number; title: string | null; client: { name: string } | null };
      return ((data ?? []) as unknown as Row[]).map(({ client: related, ...row }) => ({ ...row, client_name: related?.name ?? null }));
    },

    async listExpenses(companyId, quoteIds) {
      const { data, error } = await client
        .from("expenses")
        .select("id, description, category_id, amount_cents, expense_date, kind, employee_id, template_id, notes, quote_id, supplier_id, payment_method, category:expense_categories(name), supplier_ref:suppliers(name)")
        .eq("company_id", companyId)
        .in("quote_id", quoteIds)
        .is("deleted_at", null)
        .order("expense_date", { ascending: false });
      if (error) fail(error);
      type Supplier = { name: string } | { name: string }[] | null;
      type Row = Omit<Expense, "category_name"> & { category: { name: string } | null; supplier_ref: Supplier };
      return ((data ?? []) as unknown as Row[]).map(({ category, supplier_ref, ...row }) => ({
        ...row,
        category_name: category?.name ?? "",
        supplier: (Array.isArray(supplier_ref) ? supplier_ref[0] : supplier_ref)?.name ?? null,
      }));
    },

    async listLabor(companyId, quoteIds) {
      const { data, error } = await client
        .from("time_entries")
        .select("employee_id, starts_at, ends_at, break_minutes, employee:employees(name), visit:visits!inner(quote_id)")
        .eq("company_id", companyId)
        .in("visit.quote_id", quoteIds)
        .is("deleted_at", null);
      if (error) fail(error);
      type Row = {
        employee_id: string;
        starts_at: string;
        ends_at: string;
        break_minutes: number;
        employee: { name: string } | null;
        visit: { quote_id: string | null } | null;
      };
      return ((data ?? []) as unknown as Row[]).flatMap((row): LaborEntry[] =>
        row.visit?.quote_id
          ? [
              {
                quote_id: row.visit.quote_id,
                employee_id: row.employee_id,
                employee_name: row.employee?.name ?? "",
                minutes: minutesOf(row.ends_at) - minutesOf(row.starts_at) - (row.break_minutes ?? 0),
              },
            ]
          : [],
      );
    },

    async listRates(companyId, employeeIds) {
      if (employeeIds.length === 0) return [];
      const { data, error } = await client
        .from("employee_payment_details")
        .select("employee_id, hourly_cost_cents, hourly_pay_cents")
        .eq("company_id", companyId)
        .in("employee_id", employeeIds)
        .is("deleted_at", null);
      if (error) fail(error);
      return (data ?? []) as LaborRate[];
    },
  };
}
