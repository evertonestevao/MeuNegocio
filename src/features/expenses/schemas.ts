import { z } from "zod";
import { parseMoneyToCents } from "@/lib/money";

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
});

export type ExpenseInput = z.output<typeof expenseSchema>;

export function parseExpenseForm(formData: FormData): ExpenseInput {
  return expenseSchema.parse({
    description: text(formData, "description"),
    categoryId: text(formData, "categoryId"),
    amountCents: text(formData, "amount"),
    expenseDate: text(formData, "expenseDate"),
    employeeId: text(formData, "employeeId"),
    notes: text(formData, "notes"),
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

export const categoryNameSchema = z.string().trim().min(2, "Informe o nome da categoria.").max(80, "Use até 80 caracteres.");

export const EXPENSE_KIND_LABEL = {
  recurring: "Recorrente",
  one_off: "Pontual",
  payroll: "Funcionário",
  contractor: "Prestador",
} as const;
