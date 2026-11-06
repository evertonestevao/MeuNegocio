import { z } from "zod";
import { documentProblem, formatDocument, formatPhone, isValidPhone } from "@/lib/masks";

/** Validação de clientes, contatos e locais: roda no navegador e de novo no servidor. */

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use até ${max} caracteres.`)
    .transform((value) => value || null);

export const clientSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome do cliente.").max(160, "Use até 160 caracteres."),
  document: z
    .string()
    .trim()
    .superRefine((value, ctx) => {
      const problem = documentProblem(value);
      if (problem) ctx.addIssue({ code: "custom", message: problem });
    })
    .transform((value) => value || null),
  notes: optionalText(2000),
});

export const contactSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome do contato.").max(160, "Use até 160 caracteres."),
  role: optionalText(120),
  phone: optionalText(30)
    .refine((value) => value === null || isValidPhone(value), "Informe o telefone com DDD.")
    .transform((value) => (value ? formatPhone(value) : null)),
  email: z
    .string()
    .trim()
    .refine((value) => value === "" || z.email().safeParse(value).success, "Informe um e-mail válido.")
    .transform((value) => value || null),
  isPrimary: z.boolean(),
});

export const locationSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome do local.").max(120, "Use até 120 caracteres."),
  address: z.string().trim().min(5, "Informe o endereço completo.").max(300, "Use até 300 caracteres."),
  notes: optionalText(1000),
});

export type ClientInput = z.output<typeof clientSchema>;
export type ContactInput = z.output<typeof contactSchema>;
export type LocationInput = z.output<typeof locationSchema>;

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export function parseClientForm(formData: FormData): ClientInput {
  return clientSchema.parse({
    name: text(formData, "name"),
    document: text(formData, "document"),
    notes: text(formData, "notes"),
  });
}

export function parseContactForm(formData: FormData): ContactInput {
  return contactSchema.parse({
    name: text(formData, "name"),
    role: text(formData, "role"),
    phone: text(formData, "phone"),
    email: text(formData, "email"),
    isPrimary: formData.get("isPrimary") === "on",
  });
}

export function parseLocationForm(formData: FormData): LocationInput {
  return locationSchema.parse({
    name: text(formData, "name"),
    address: text(formData, "address"),
    notes: text(formData, "notes"),
  });
}

export { formatDocument };
