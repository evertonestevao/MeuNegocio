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

/** Condições de pagamento combinadas no orçamento. Sem datas: as parcelas contam do fechamento. */
export interface QuotePaymentPlan {
  kind: "cash" | "entry" | "card";
  method: PaymentMethod | null;
  entry_cents: number;
  entry_method: PaymentMethod | null;
  count: number;
}

/** Taxas da maquininha, em centésimos de ponto percentual (3,49% = 349). */
export interface CardFees {
  creditBps: number;
  debitBps: number;
}

/** Parcela a receber de um serviço fechado. Recebida quando tem received_on. */
export interface Receivable {
  id: string;
  quote_id: string;
  amount_cents: number;
  /** Taxa da maquininha: custo do serviço; o caixa recebe amount − fee. */
  fee_cents?: number;
  due_date: string;
  method: PaymentMethod | null;
  received_on: string | null;
  received_cents: number | null;
  quote_number: number;
  quote_title: string | null;
  client_name: string | null;
  client_id?: string | null;
  /** Contato principal do cliente, para o lembrete de cobrança. */
  contact_name?: string | null;
  contact_phone?: string | null;
}

/** Parcela que o fechamento grava. */
export interface InstallmentInput {
  amount_cents: number;
  due_date: string;
  method: PaymentMethod | null;
  received: boolean;
}

/** O que o recibo de uma parcela recebida mostra. */
export interface ReceiptData {
  company: { name: string; cnpj: string | null; phone: string | null; email: string | null; address: string | null };
  client: { name: string; document: string | null } | null;
  quoteNumber: number;
  quoteTitle: string | null;
  /** Parcela desta no serviço: 2 de 3. */
  installment: { index: number; total: number };
  receivedCents: number;
  receivedOn: string;
  method: PaymentMethod | null;
}
