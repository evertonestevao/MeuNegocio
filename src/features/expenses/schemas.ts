import { z } from "zod";
import { formatDocument, formatPhone, isValidPhone } from "@/lib/masks";
import { parseMoneyToCents } from "@/lib/money";
import { MAX_INSTALLMENTS, type PayablePlan } from "@/lib/payables";
import type { PaymentMethod } from "@/types/finance";

/** Validação de gastos: roda no navegador e de novo no servidor. */

const money = z.string().transform((value, context) => {
  const cents = parseMoneyToCents(value);
  if (cents === null || cents <= 0) {
    context.addIssue({ code: "custom", message: "Informe um valor maior que zero, como 149,90." });
    return z.NEVER;
  }
  return cents;
});
const optionalUuid = z.union([z.uuid(), z.literal("")]).transform((value) => value || null);

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export const expenseSchema = z.object({
  description: z.string().trim().min(2, "Informe a descrição.").max(200, "Use até 200 caracteres."),
  categoryId: z.uuid({ error: "Escolha a categoria." }),
  amountCents: money,
  expenseDate: z.iso.date({ error: "Informe a data." }),
  employeeId: optionalUuid,
  notes: z.string().trim().max(1000, "Use até 1000 caracteres.").transform((value) => value || null),
  quoteId: optionalUuid.default(""),
  /** Escolhido na lista; sem ele, o nome digitado vira um fornecedor novo. */
  supplierId: optionalUuid.default(""),
  supplierName: z.string().trim().max(120, "Use até 120 caracteres.").default("").transform((value) => value || null),
  paymentMethod: z
    .union([z.enum(["pix", "cash", "debit", "credit", "boleto", "transfer", "other"]), z.literal("")])
    .default("")
    .transform((value) => (value || null) as PaymentMethod | null),
});

/**
 * Como o gasto vai ser pago. "keep" mantém as parcelas como estão (gasto com parcelas já pagas, em que
 * valor e parcelas ficam travados).
 */
export const expensePaymentSchema = z
  .object({
    mode: z.enum(["paid", "pending", "keep"], { error: "Diga se o gasto já foi pago ou se vai pagar depois." }),
    paidOn: z.string().default(""),
    count: z.string().default("1"),
    firstDueDate: z.string().default(""),
  })
  .transform((value, context): PayablePlan | null => {
    if (value.mode === "keep") return null;
    if (value.mode === "paid") {
      if (!z.iso.date().safeParse(value.paidOn).success) {
        context.addIssue({ code: "custom", path: ["paidOn"], message: "Informe a data em que pagou." });
        return z.NEVER;
      }
      return { mode: "paid", paidOn: value.paidOn, count: 1, firstDueDate: value.paidOn };
    }
    const count = Number(value.count.trim());
    if (!Number.isInteger(count) || count < 1 || count > MAX_INSTALLMENTS) {
      context.addIssue({ code: "custom", path: ["count"], message: `Use de 1 a ${MAX_INSTALLMENTS} parcelas.` });
      return z.NEVER;
    }
    if (!z.iso.date().safeParse(value.firstDueDate).success) {
      context.addIssue({ code: "custom", path: ["firstDueDate"], message: "Informe o vencimento da 1ª parcela." });
      return z.NEVER;
    }
    return { mode: "pending", paidOn: "", count, firstDueDate: value.firstDueDate };
  });

export type ExpenseInput = z.output<typeof expenseSchema> & { payment: PayablePlan | null };

export function parseExpenseForm(formData: FormData): ExpenseInput {
  const payment = expensePaymentSchema.parse({
    mode: text(formData, "paymentMode") || "paid",
    paidOn: text(formData, "paidOn") || text(formData, "expenseDate"),
    count: text(formData, "installmentsCount") || "1",
    firstDueDate: text(formData, "firstDueDate"),
  });
  return { ...parseExpenseFields(formData), payment };
}

function parseExpenseFields(formData: FormData): z.output<typeof expenseSchema> {
  return expenseSchema.parse({
    description: text(formData, "description"),
    categoryId: text(formData, "categoryId"),
    amountCents: text(formData, "amount"),
    expenseDate: text(formData, "expenseDate"),
    employeeId: text(formData, "employeeId"),
    notes: text(formData, "notes"),
    quoteId: text(formData, "quoteId"),
    supplierId: text(formData, "supplierId"),
    supplierName: text(formData, "supplierName"),
    paymentMethod: text(formData, "paymentMethod"),
  });
}

export const expenseTemplateSchema = z
  .object({
    description: z.string().trim().min(2, "Informe a descrição.").max(160, "Use até 160 caracteres."),
    categoryId: z.uuid({ error: "Escolha a categoria." }),
    amountCents: money,
    employeeId: optionalUuid,
    dayOfMonth: z.coerce.number({ error: "Use um dia de 1 a 28." }).int("Use um dia de 1 a 28.").min(1, "Use um dia de 1 a 28.").max(28, "Use um dia de 1 a 28."),
    startsOn: z.iso.date({ error: "Informe o início." }),
    endsOn: z.union([z.iso.date(), z.literal("")]).transform((value) => value || null),
    active: z.boolean(),
  })
  .refine((template) => !template.endsOn || template.endsOn >= template.startsOn, {
    message: "O fim precisa ser depois do início.",
  });

export type ExpenseTemplateInput = z.output<typeof expenseTemplateSchema>;

export function parseExpenseTemplateForm(formData: FormData): ExpenseTemplateInput {
  return expenseTemplateSchema.parse({
    description: text(formData, "description"),
    categoryId: text(formData, "categoryId"),
    amountCents: text(formData, "amount"),
    employeeId: text(formData, "employeeId"),
    dayOfMonth: text(formData, "dayOfMonth"),
    startsOn: text(formData, "startsOn"),
    endsOn: text(formData, "endsOn"),
    active: formData.get("active") === "on",
  });
}

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  pix: "PIX",
  cash: "Dinheiro",
  debit: "Cartão de débito",
  credit: "Cartão de crédito",
  boleto: "Boleto",
  transfer: "Transferência",
  other: "Outro",
};

/**
 * Forma de pagamento no texto do recibo, com a preposição certa: "por PIX", "em dinheiro".
 * Evita o "por pix" minúsculo que saía de um toLowerCase no rótulo.
 */
export const PAYMENT_METHOD_RECEIPT_PHRASE: Record<PaymentMethod, string> = {
  pix: "por PIX",
  cash: "em dinheiro",
  debit: "no cartão de débito",
  credit: "no cartão de crédito",
  boleto: "por boleto",
  transfer: "por transferência",
  other: "por outro meio",
};

const optionalSupplierText = (max: number) =>
  z.string().trim().max(max, `Use até ${max} caracteres.`).default("").transform((value) => value || null);

export const supplierSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome do fornecedor.").max(120, "Use até 120 caracteres."),
  document: optionalSupplierText(20)
    .refine((value) => value === null || [11, 14].includes(value.replace(/\D/g, "").length), "Informe o CPF ou o CNPJ completo.")
    .transform((value) => (value ? formatDocument(value) : null)),
  phone: optionalSupplierText(30)
    .refine((value) => value === null || isValidPhone(value), "Informe o telefone com DDD.")
    .transform((value) => (value ? formatPhone(value) : null)),
  notes: optionalSupplierText(500),
});

export type SupplierInput = z.output<typeof supplierSchema>;

export function parseSupplierForm(formData: FormData): SupplierInput {
  return supplierSchema.parse({
    name: text(formData, "name"),
    document: text(formData, "document"),
    phone: text(formData, "phone"),
    notes: text(formData, "notes"),
  });
}

/** Mesmo nome, com ou sem acento e maiúsculas: usado para achar o fornecedor ao digitar. */
export function supplierSearchKey(name: string): string {
  return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** Campo de dinheiro vindo da URL: "150,00" vira centavos; vazio ou inválido vira null. */
const moneyFilter = z
  .string()
  .default("")
  .transform((value) => {
    const cents = parseMoneyToCents(value.trim());
    return cents && cents > 0 ? cents : null;
  });

/** Filtro da ficha do fornecedor: busca na descrição e faixa de preço das compras. */
export const supplierPurchaseFilterSchema = z
  .object({
    search: z.string().trim().max(200).catch("").default(""),
    min: moneyFilter,
    max: moneyFilter,
    sort: z.enum(["recent", "amount"]).catch("recent"),
  })
  .transform(({ search, min, max, sort }) => ({
    search,
    // Faixa invertida (mínimo acima do máximo) ignora o mínimo, em vez de não achar nada.
    minCents: min !== null && max !== null && min > max ? null : min,
    maxCents: max,
    sort,
  }));

export type SupplierPurchaseFilters = z.output<typeof supplierPurchaseFilterSchema>;

export function parseSupplierPurchaseFilters(params: { q?: string; min?: string; max?: string; sort?: string }): SupplierPurchaseFilters {
  return supplierPurchaseFilterSchema.parse({
    search: params.q ?? "",
    min: params.min ?? "",
    max: params.max ?? "",
    sort: params.sort ?? "recent",
  });
}

export const categoryNameSchema = z.string().trim().min(2, "Informe o nome da categoria.").max(80, "Use até 80 caracteres.");

export const EXPENSE_KIND_LABEL = {
  recurring: "Recorrente",
  one_off: "Pontual",
  payroll: "Funcionário",
  contractor: "Prestador",
} as const;
