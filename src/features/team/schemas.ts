import { z } from "zod";
import { parseMoneyToCents } from "@/lib/money";
import { formatDocument, formatPhone, isValidPhone } from "@/lib/masks";

/** Validação da equipe: roda no navegador e de novo no servidor. */

const optionalText = (max: number) =>
  z.string().trim().max(max, `Use até ${max} caracteres.`).transform((value) => value || null);

const money = z.string().transform((value, context) => {
  const cents = parseMoneyToCents(value === "" ? "0" : value);
  if (cents === null) {
    context.addIssue({ code: "custom", message: "Informe um valor válido, como 35,00." });
    return z.NEVER;
  }
  return cents;
});

export const CONTRACT_LABEL = { clt: "CLT", pj: "PJ", freelancer: "Autônomo" } as const;

export const employeeSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome.").max(160, "Use até 160 caracteres."),
  jobTitle: optionalText(120),
  active: z.boolean(),
  userId: z.union([z.uuid(), z.literal("")]).transform((value) => value || null),
  phone: optionalText(30)
    .refine((value) => value === null || isValidPhone(value), "Informe o telefone com DDD.")
    .transform((value) => (value ? formatPhone(value) : null)),
  contractType: z.enum(["clt", "pj", "freelancer"], { error: "Escolha o contrato." }),
  hourlyCostCents: money,
  hourlyPayCents: money,
  legalName: optionalText(160),
  taxId: z
    .string()
    .trim()
    .refine((value) => {
      const digits = value.replace(/\D/g, "");
      return value === "" || digits.length === 11 || digits.length === 14;
    }, "Informe um CPF com 11 dígitos ou um CNPJ com 14.")
    .transform((value) => (value ? formatDocument(value) : null)),
  pixKey: optionalText(140),
});

export type EmployeeInput = z.output<typeof employeeSchema>;

export function parseEmployeeForm(formData: FormData): EmployeeInput {
  const text = (key: string) => {
    const value = formData.get(key);
    return typeof value === "string" ? value : "";
  };
  return employeeSchema.parse({
    name: text("name"),
    jobTitle: text("jobTitle"),
    active: formData.get("active") === "on",
    userId: text("userId"),
    phone: text("phone"),
    contractType: text("contractType"),
    hourlyCostCents: text("hourlyCost"),
    hourlyPayCents: text("hourlyPay"),
    legalName: text("legalName"),
    taxId: text("taxId"),
    pixKey: text("pixKey"),
  });
}
