import { z } from "zod";
import { AppError } from "@/lib/errors";
import { formatDocument, formatPhone, isValidCnpjLength, isValidPhone } from "@/lib/masks";
import type { ActorContext } from "@/server/actor";
import type { CompanyProfile } from "@/types/database";
import { permissionService } from "./permissionService";

/** Dados da empresa usados no PDF, no link de aprovação e nos padrões do orçamento. */

export const COMPANY_TIMEZONES = [
  "America/Sao_Paulo",
  "America/Manaus",
  "America/Cuiaba",
  "America/Rio_Branco",
  "America/Noronha",
] as const;

const optionalText = (max: number) =>
  z.string().trim().max(max, `Use até ${max} caracteres.`).transform((value) => value || null);

export const companyProfileSchema = z.object({
  cnpj: optionalText(20)
    .refine((value) => value === null || isValidCnpjLength(value), "Informe o CNPJ com 14 dígitos.")
    .transform((value) => (value ? formatDocument(value) : null)),
  phone: optionalText(30)
    .refine((value) => value === null || isValidPhone(value), "Informe o telefone com DDD.")
    .transform((value) => (value ? formatPhone(value) : null)),
  email: z
    .string()
    .trim()
    .refine((value) => value === "" || z.email().safeParse(value).success, "Informe um e-mail válido.")
    .transform((value) => value || null),
  address: optionalText(300),
  quoteValidityDays: z.coerce.number({ error: "Informe a validade em dias." }).int("Informe a validade em dias.").min(1, "A validade mínima é 1 dia.").max(365, "A validade máxima é 365 dias."),
  quoteDefaultNotes: optionalText(4000),
  timezone: z.enum(COMPANY_TIMEZONES, { error: "Escolha o fuso." }),
});

export type CompanyProfileInput = z.output<typeof companyProfileSchema>;

export interface CompanyProfileRepository {
  get(companyId: string): Promise<CompanyProfile | null>;
  upsert(companyId: string, input: CompanyProfileInput): Promise<void>;
}

export const DEFAULT_COMPANY_PROFILE = {
  cnpj: null,
  phone: null,
  email: null,
  address: null,
  quote_validity_days: 15,
  quote_default_notes: null,
  timezone: "America/Sao_Paulo",
} as const;

export function createCompanyProfileService(repo: CompanyProfileRepository) {
  return {
    /** Empresa sem dados preenchidos recebe os padrões. */
    async get(companyId: string): Promise<CompanyProfile> {
      return (await repo.get(companyId)) ?? { company_id: companyId, ...DEFAULT_COMPANY_PROFILE };
    },

    async save(actor: ActorContext, input: CompanyProfileInput): Promise<void> {
      if (!permissionService.canEditCompany(actor.role)) {
        throw new AppError("forbidden", "Só o proprietário e o administrador editam os dados da empresa");
      }
      await repo.upsert(actor.companyId, input);
    },
  };
}

export type CompanyProfileService = ReturnType<typeof createCompanyProfileService>;
