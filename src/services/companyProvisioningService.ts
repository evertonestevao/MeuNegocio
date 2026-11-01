import { z } from "zod";
import { emailSchema } from "@/features/auth/schemas";
import { AppError } from "@/lib/errors";
import { slugify } from "./tenantService";

/** Super admin cria a empresa e o acesso do responsável. A permissão é conferida na action. */

export const provisionCompanySchema = z.object({
  companyName: z.string().trim().min(2, "Informe o nome da empresa.").max(80, "Use até 80 caracteres."),
  ownerName: z.string().trim().min(2, "Informe o nome do responsável.").max(120, "Use até 120 caracteres."),
  ownerEmail: emailSchema,
  planId: z.union([z.uuid(), z.literal("")]).transform((value) => value || null),
});

export type ProvisionCompanyInput = z.output<typeof provisionCompanySchema>;

export interface CompanyProvisioningRepository {
  /** Cria o usuário já confirmado, com troca de senha obrigatória. Email em uso: conflict. */
  createOwner(data: { email: string; fullName: string; password: string }): Promise<string>;
  deleteOwner(userId: string): Promise<void>;
  createCompany(data: { name: string; slug: string; ownerId: string; planId: string | null; actorId: string }): Promise<void>;
}

interface Deps {
  repo: CompanyProvisioningRepository;
  generatePassword(): string;
  randomSuffix(): string;
}

export function createCompanyProvisioningService({ repo, generatePassword, randomSuffix }: Deps) {
  return {
    async provision(input: ProvisionCompanyInput, actorId: string): Promise<{ email: string; temporaryPassword: string }> {
      const temporaryPassword = generatePassword();
      const email = input.ownerEmail.toLowerCase();
      const ownerId = await repo.createOwner({ email, fullName: input.ownerName, password: temporaryPassword });
      try {
        const base = { name: input.companyName, ownerId, planId: input.planId, actorId };
        try {
          await repo.createCompany({ ...base, slug: slugify(input.companyName) });
        } catch (err) {
          if (!(err instanceof AppError && err.code === "conflict")) throw err;
          await repo.createCompany({ ...base, slug: `${slugify(input.companyName)}-${randomSuffix()}` });
        }
      } catch (err) {
        // Sem empresa, o acesso criado não serve para nada: não fica para trás.
        await repo.deleteOwner(ownerId);
        throw err;
      }
      return { email, temporaryPassword };
    },
  };
}
