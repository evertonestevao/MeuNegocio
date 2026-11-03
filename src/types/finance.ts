import type { ContractType } from "./database";

export type TimeEntryStatus = "pending" | "approved" | "paid";

export interface TimeEntry {
  id: string;
  employee_id: string;
  entry_date: string;
  starts_at: string;
  ends_at: string;
  break_minutes: number;
  visit_id: string | null;
  client_id: string | null;
  client_name: string | null;
  location_name: string | null;
  notes: string | null;
  status: TimeEntryStatus;
}

export interface TimeSuggestion {
  visit_id: string;
  employee_id: string;
  entry_date: string;
  starts_at: string;
  ends_at: string;
  break_minutes: number;
  client_id: string;
  client_name: string;
  location_name: string;
  dismissed: boolean;
}

export interface HoursEmployee {
  id: string;
  name: string;
  active: boolean;
  contract_type: ContractType;
  hourly_pay_cents: number;
}

export interface HoursMonth {
  employees: HoursEmployee[];
  entries: TimeEntry[];
  suggestions: TimeSuggestion[];
}

export interface HoursPersonSummary extends HoursEmployee {
  openMinutes: number;
  paidMinutes: number;
  openPayCents: number;
  entries: TimeEntry[];
  suggestions: TimeSuggestion[];
}

export interface RevenueListItem {
  id: string;
  quote_id: string;
  amount_cents: number;
  competence_date: string;
  quote_number: number;
  quote_title: string | null;
  client_name: string | null;
}

export type ExpenseKind = "recurring" | "one_off" | "payroll" | "contractor";

export interface ExpenseCategory {
  id: string;
  name: string;
  system_key: "payroll" | "contractors" | null;
}

export interface Expense {
  id: string;
  description: string;
  category_id: string;
  category_name: string;
  amount_cents: number;
  expense_date: string;
  kind: ExpenseKind;
  employee_id: string | null;
  template_id: string | null;
  notes: string | null;
  /** Orçamento aprovado ou fechado a que o gasto pertence. */
  quote_id?: string | null;
  quote_number?: number | null;
  supplier_id?: string | null;
  /** Nome do fornecedor cadastrado, para exibir. */
  supplier?: string | null;
  payment_method?: PaymentMethod | null;
}

export type PaymentMethod = "pix" | "cash" | "debit" | "credit" | "boleto" | "transfer" | "other";

export interface Supplier {
  id: string;
  name: string;
  document: string | null;
  phone: string | null;
  notes: string | null;
}

/** Gasto resumido para as contas por fornecedor. */
export interface SupplierSpend {
  supplier_id: string;
  amount_cents: number;
  expense_date: string;
  category_id: string;
  category_name: string;
}

export interface ExpenseTemplate {
  id: string;
  description: string;
  category_id: string;
  category_name: string;
  amount_cents: number;
  employee_id: string | null;
  day_of_month: number;
  starts_on: string;
  ends_on: string | null;
  active: boolean;
}
