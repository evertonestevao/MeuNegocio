import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExpenseInput, ExpenseTemplateInput } from "@/features/expenses/schemas";
import { AppError } from "@/lib/errors";
import type { ExpenseRepository } from "@/services/expenseService";
import type { Expense, ExpenseCategory, ExpenseTemplate, Supplier, SupplierSpend } from "@/types/finance";

function fail(error: { code?: string; message?: string } | null): never {
  if (error?.code === "P0001") throw new AppError("conflict", error.message ?? "Operação recusada", error);
  if (error?.code === "42501") throw new AppError("forbidden", "Sem permissão para esta ação", error);
  if (error?.code === "23505") throw new AppError("conflict", "Já existe uma categoria com esse nome.", error);
  throw new AppError("internal_error", "Falha ao acessar os gastos", error);
}

function expenseColumns(input: ExpenseInput) {
  return {
    description: input.description,
    category_id: input.categoryId,
    amount_cents: input.amountCents,
    expense_date: input.expenseDate,
    employee_id: input.employeeId,
    notes: input.notes,
    quote_id: input.quoteId,
    supplier_id: input.supplierId,
    payment_method: input.paymentMethod,
  };
}

function templateColumns(input: ExpenseTemplateInput) {
  return {
    description: input.description,
    category_id: input.categoryId,
    amount_cents: input.amountCents,
    employee_id: input.employeeId,
    day_of_month: input.dayOfMonth,
    starts_on: input.startsOn,
    ends_on: input.endsOn,
    active: input.active,
  };
}

type Related<T> = T | T[] | null;
type WithCategory<T> = T & { category: { name: string } | null; quote?: Related<{ number: number }>; supplier_ref?: Related<{ name: string }> };

const one = <T,>(value: Related<T> | undefined) => (Array.isArray(value) ? value[0] : value) ?? null;

function flatten<T extends object>({ category, quote, supplier_ref, ...row }: WithCategory<T>) {
  return {
    ...row,
    category_name: category?.name ?? "",
    ...(quote === undefined ? {} : { quote_number: one(quote)?.number ?? null }),
    ...(supplier_ref === undefined ? {} : { supplier: one(supplier_ref)?.name ?? null }),
  };
}

export function createSupabaseExpenseRepository(client: SupabaseClient): ExpenseRepository {
  async function softDelete(table: string, companyId: string, id: string): Promise<void> {
    const { error } = await client
      .from(table)
      .update({ deleted_at: new Date().toISOString() })
      .eq("company_id", companyId)
      .eq("id", id)
      .is("deleted_at", null);
    if (error) fail(error);
  }

  const EXPENSE_SELECT =
    "id, description, category_id, amount_cents, expense_date, kind, employee_id, template_id, notes, quote_id, supplier_id, payment_method, category:expense_categories(name), quote:quotes(number), supplier_ref:suppliers(name)";

  return {
    async list(companyId, from, to) {
      const { data, error } = await client
        .from("expenses")
        .select(EXPENSE_SELECT)
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .gte("expense_date", from)
        .lte("expense_date", to)
        .order("expense_date", { ascending: false });
      if (error) fail(error);
      return ((data ?? []) as unknown as WithCategory<Omit<Expense, "category_name">>[]).map((row) => flatten(row) as Expense);
    },

    async get(companyId, expenseId) {
      const { data, error } = await client
        .from("expenses")
        .select(EXPENSE_SELECT)
        .eq("company_id", companyId)
        .eq("id", expenseId)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) fail(error);
      return data ? (flatten(data as unknown as WithCategory<Omit<Expense, "category_name">>) as Expense) : null;
    },

    async insert(companyId, input) {
      const { data, error } = await client
        .from("expenses")
        .insert({ company_id: companyId, kind: "one_off", ...expenseColumns(input) })
        .select("id")
        .single<{ id: string }>();
      if (error) fail(error);
      return data.id;
    },

    async update(companyId, expenseId, input) {
      const { error } = await client
        .from("expenses")
        .update(expenseColumns(input))
        .eq("company_id", companyId)
        .eq("id", expenseId)
        .is("deleted_at", null);
      if (error) fail(error);
    },

    async remove(companyId, expenseId) {
      const { error } = await client.rpc("delete_expense", { p_company_id: companyId, p_expense_id: expenseId });
      if (error) fail(error);
    },

    async generateMonth(companyId, month) {
      const { data, error } = await client.rpc("generate_expenses_now", { p_company_id: companyId, p_month: month });
      if (error) fail(error);
      return data as number;
    },

    async listTemplates(companyId) {
      const { data, error } = await client
        .from("expense_templates")
        .select("id, description, category_id, amount_cents, employee_id, day_of_month, starts_on, ends_on, active, category:expense_categories(name)")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("day_of_month");
      if (error) fail(error);
      return ((data ?? []) as unknown as WithCategory<Omit<ExpenseTemplate, "category_name">>[]).map((row) => flatten(row) as ExpenseTemplate);
    },

    async insertTemplate(companyId, input) {
      const { error } = await client.from("expense_templates").insert({ company_id: companyId, ...templateColumns(input) });
      if (error) fail(error);
    },

    async updateTemplate(companyId, templateId, input) {
      const { error } = await client
        .from("expense_templates")
        .update(templateColumns(input))
        .eq("company_id", companyId)
        .eq("id", templateId)
        .is("deleted_at", null);
      if (error) fail(error);
    },

    softDeleteTemplate: (companyId, templateId) => softDelete("expense_templates", companyId, templateId),

    async listSuppliers(companyId) {
      const { data, error } = await client
        .from("suppliers")
        .select("id, name, document, phone, notes")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("name");
      if (error) fail(error);
      return (data ?? []) as Supplier[];
    },

    async insertSupplier(companyId, input) {
      const { data, error } = await client
        .from("suppliers")
        .insert({ company_id: companyId, ...input })
        .select("id")
        .single<{ id: string }>();
      if (error?.code === "23505") throw new AppError("conflict", "Já existe um fornecedor com esse nome.", error);
      if (error) fail(error);
      return data.id;
    },

    async updateSupplier(companyId, supplierId, input) {
      const { error } = await client
        .from("suppliers")
        .update(input)
        .eq("company_id", companyId)
        .eq("id", supplierId)
        .is("deleted_at", null);
      if (error?.code === "23505") throw new AppError("conflict", "Já existe um fornecedor com esse nome.", error);
      if (error) fail(error);
    },

    async softDeleteSupplier(companyId, supplierId) {
      await softDelete("suppliers", companyId, supplierId);
    },

    async listSupplierSpend(companyId, from) {
      let query = client
        .from("expenses")
        .select("supplier_id, amount_cents, expense_date, category_id, category:expense_categories(name)")
        .eq("company_id", companyId)
        .not("supplier_id", "is", null)
        .is("deleted_at", null);
      if (from) query = query.gte("expense_date", from);
      const { data, error } = await query;
      if (error) fail(error);
      type Row = Omit<SupplierSpend, "category_name"> & { category: { name: string } | null };
      return ((data ?? []) as unknown as Row[]).map(({ category, ...row }) => ({ ...row, category_name: category?.name ?? "" }));
    },

    async listCategories(companyId) {
      const { data, error } = await client
        .from("expense_categories")
        .select("id, name, system_key")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("name");
      if (error) fail(error);
      return (data ?? []) as ExpenseCategory[];
    },

    async insertCategory(companyId, name) {
      const { error } = await client.from("expense_categories").insert({ company_id: companyId, name });
      if (error) fail(error);
    },

    async renameCategory(companyId, categoryId, name) {
      const { error } = await client
        .from("expense_categories")
        .update({ name })
        .eq("company_id", companyId)
        .eq("id", categoryId)
        .is("deleted_at", null);
      if (error) fail(error);
    },

    softDeleteCategory: (companyId, categoryId) => softDelete("expense_categories", companyId, categoryId),

    async categoryInUse(companyId, categoryId) {
      const counts = await Promise.all(
        ["expenses", "expense_templates"].map((table) =>
          client
            .from(table)
            .select("id", { count: "exact", head: true })
            .eq("company_id", companyId)
            .eq("category_id", categoryId)
            .is("deleted_at", null),
        ),
      );
      for (const { error } of counts) if (error) fail(error);
      return counts.some(({ count }) => (count ?? 0) > 0);
    },
  };
}
