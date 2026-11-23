import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExpenseInput, ExpenseTemplateInput } from "@/features/expenses/schemas";
import { AppError } from "@/lib/errors";
import type { ExpenseRepository } from "@/services/expenseService";
import type { Expense, ExpenseCategory, ExpenseInstallment, ExpenseKind, ExpenseTemplate, PayableItem, PaymentMethod, Supplier, SupplierSpend } from "@/types/finance";

function fail(error: { code?: string; message?: string } | null): never {
  if (error?.code === "P0001") throw new AppError("conflict", error.message ?? "Operação recusada", error);
  if (error?.code === "42501") throw new AppError("forbidden", "Sem permissão para esta ação", error);
  if (error?.code === "23505") throw new AppError("conflict", "Já existe uma categoria com esse nome.", error);
  throw new AppError("internal_error", "Falha ao acessar os gastos", error);
}

/** Campos do gasto como a função save_expense recebe. */
function expenseFields(input: ExpenseInput) {
  return {
    description: input.description,
    category_id: input.categoryId,
    amount_cents: input.amountCents,
    expense_date: input.expenseDate,
    employee_id: input.employeeId ?? "",
    notes: input.notes ?? "",
    quote_id: input.quoteId ?? "",
    supplier_id: input.supplierId ?? "",
    payment_method: input.paymentMethod ?? "",
  };
}

export type InstallmentRow = ExpenseInstallment & { deleted_at?: string | null };

/** Embutido das parcelas na leitura de um gasto. */
export const INSTALLMENTS_EMBED = "installments:expense_installments(id, expense_id, number, due_date, amount_cents, paid_on, deleted_at)";

/** Parcelas que valem (sem as substituídas), na ordem. */
export function liveInstallments(rows: InstallmentRow[] | null | undefined): ExpenseInstallment[] {
  return (rows ?? [])
    .filter((row) => !row.deleted_at)
    .map(({ id, expense_id, number, due_date, amount_cents, paid_on }) => ({ id, expense_id, number, due_date, amount_cents, paid_on }))
    .toSorted((a, b) => a.number - b.number);
}

const PAYABLE_SELECT =
  "id, expense_id, number, due_date, amount_cents, paid_on, expense:expenses!inner(description, kind, payment_method, deleted_at, category:expense_categories(name), supplier_ref:suppliers(name), installments:expense_installments(id, deleted_at))";

type PayableRow = ExpenseInstallment & {
  expense: {
    description: string;
    kind: ExpenseKind;
    payment_method: PaymentMethod | null;
    category: { name: string } | null;
    supplier_ref: { name: string } | { name: string }[] | null;
    installments: { id: string; deleted_at: string | null }[] | null;
  } | null;
};

function toPayable({ expense, ...row }: PayableRow): PayableItem {
  const supplier = Array.isArray(expense?.supplier_ref) ? expense?.supplier_ref[0] : expense?.supplier_ref;
  return {
    ...row,
    description: expense?.description ?? "",
    kind: expense?.kind ?? "one_off",
    category_name: expense?.category?.name ?? "",
    supplier: supplier?.name ?? null,
    payment_method: expense?.payment_method ?? null,
    installments_count: (expense?.installments ?? []).filter((item) => !item.deleted_at).length || 1,
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

function flatten<T extends object>({ category, quote, supplier_ref, installments, ...row }: WithCategory<T> & { installments?: InstallmentRow[] | null }) {
  return {
    ...row,
    ...(installments === undefined ? {} : { installments: liveInstallments(installments) }),
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
    `id, description, category_id, amount_cents, expense_date, kind, employee_id, template_id, notes, quote_id, supplier_id, payment_method, category:expense_categories(name), quote:quotes(number), supplier_ref:suppliers(name), ${INSTALLMENTS_EMBED}`;

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

    async save(companyId, expenseId, input, installments) {
      const { data, error } = await client.rpc("save_expense", {
        p_company_id: companyId,
        p_expense_id: expenseId,
        p_expense: expenseFields(input),
        p_installments: installments,
      });
      if (error) fail(error);
      return data as string;
    },

    async listOpenPayables(companyId) {
      const { data, error } = await client
        .from("expense_installments")
        .select(PAYABLE_SELECT)
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .is("paid_on", null)
        .is("expense.deleted_at", null)
        .order("due_date", { ascending: true })
        .order("number", { ascending: true });
      if (error) fail(error);
      return ((data ?? []) as unknown as PayableRow[]).map(toPayable);
    },

    async listPaidPayables(companyId, from, to) {
      const { data, error } = await client
        .from("expense_installments")
        .select(PAYABLE_SELECT)
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .gte("paid_on", from)
        .lte("paid_on", to)
        .is("expense.deleted_at", null)
        .order("paid_on", { ascending: false });
      if (error) fail(error);
      return ((data ?? []) as unknown as PayableRow[]).map(toPayable);
    },

    async payInstallment(companyId, installmentId, paidOn) {
      const { error } = await client.rpc("pay_expense_installment", { p_company_id: companyId, p_installment_id: installmentId, p_paid_on: paidOn });
      if (error) fail(error);
    },

    async undoPayInstallment(companyId, installmentId) {
      const { error } = await client.rpc("undo_pay_expense_installment", { p_company_id: companyId, p_installment_id: installmentId });
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

    async getSupplier(companyId, supplierId) {
      const { data, error } = await client
        .from("suppliers")
        .select("id, name, document, phone, notes")
        .eq("company_id", companyId)
        .eq("id", supplierId)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) fail(error);
      return (data ?? null) as Supplier | null;
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

    async listBySupplier(companyId, supplierId) {
      const { data, error } = await client
        .from("expenses")
        .select(EXPENSE_SELECT)
        .eq("company_id", companyId)
        .eq("supplier_id", supplierId)
        .is("deleted_at", null)
        .order("expense_date", { ascending: false });
      if (error) fail(error);
      return ((data ?? []) as unknown as WithCategory<Omit<Expense, "category_name">>[]).map((row) => flatten(row) as Expense);
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
