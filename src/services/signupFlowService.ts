import { z } from "zod";
import { emailSchema } from "@/features/auth/schemas";
import { AppError } from "@/lib/errors";
import type { RateLimiter } from "@/server/rateLimit";
import type { SignupLead } from "@/types/database";
import type { RequestEvidence } from "./termsService";

/**
 * Cadastro em etapas: 1) nome, e-mail e aceite, guardados na hora; 2) senha, que cria a conta e uma
 * empresa com nome provisório; 3) assinatura; 4) dados essenciais da empresa.
 */

export const startSignupSchema = z.object({
  fullName: z.string().trim().min(2, "Informe seu nome.").max(120, "Use até 120 caracteres."),
  email: emailSchema.max(254, "E-mail longo demais.").transform((value) => value.toLowerCase()),
  accept_terms: z.literal("on", { error: "Para continuar, aceite os Termos de Uso e a Política de Privacidade." }),
  email_consent: z.literal("on").optional(),
});

export type StartSignupInput = z.output<typeof startSignupSchema>;

/** Nome da empresa até a pessoa informar o de verdade, no último passo. */
export function provisionalCompanyName(fullName: string): string {
  return `Empresa de ${fullName.trim()}`.slice(0, 80);
}

export interface SignupLeadRepository {
  /** Mesmo e-mail de novo atualiza o cadastro em vez de duplicar. Devolve o id. */
  upsertByEmail(data: {
    email: string;
    fullName: string;
    termsVersionId: string | null;
    emailConsent: boolean;
    evidence: RequestEvidence;
  }): Promise<string>;
  findById(id: string): Promise<SignupLead | null>;
  /** Apaga só cadastro que ainda espera a senha. */
  deletePending(id: string): Promise<void>;
  markAccount(id: string, data: { userId: string; companyId: string }): Promise<void>;
  markDoneByCompany(companyId: string): Promise<void>;
  listRecent(limit: number): Promise<SignupLead[]>;
}

interface Deps {
  repo: SignupLeadRepository;
  /** Contra envio repetido do mesmo endereço de rede. */
  ipLimiter: RateLimiter;
  /** Contra regravar o mesmo e-mail várias vezes. */
  emailLimiter: RateLimiter;
}

export function createSignupFlowService({ repo, ipLimiter, emailLimiter }: Deps) {
  /** Cadastro que ainda espera a senha. Já usado ou inexistente: o primeiro passo recomeça. */
  async function getPending(leadId: string | undefined): Promise<SignupLead | null> {
    if (!leadId || !z.uuid().safeParse(leadId).success) return null;
    const lead = await repo.findById(leadId);
    return lead?.stage === "contact" ? lead : null;
  }

  return {
    /**
     * Primeiro passo. Campo escondido preenchido é robô: responde como se tivesse dado certo e não
     * grava nada. O limite por endereço vale até para envio inválido.
     */
    async start(
      input: Record<string, unknown>,
      context: { evidence: RequestEvidence; termsVersionId: string | null; previousLeadId?: string },
    ): Promise<{ leadId: string | null }> {
      await ipLimiter.consume(`signup-lead-ip:${context.evidence.ipAddress ?? "desconhecido"}`);
      if (typeof input.website === "string" && input.website.trim() !== "") return { leadId: null };

      const parsed = startSignupSchema.safeParse(input);
      if (!parsed.success) {
        throw new AppError("validation_error", parsed.error.issues[0]?.message ?? "Dados inválidos.");
      }
      await emailLimiter.consume(`signup-lead-email:${parsed.data.email}`);
      const leadId = await repo.upsertByEmail({
        email: parsed.data.email,
        fullName: parsed.data.fullName,
        termsVersionId: context.termsVersionId,
        emailConsent: parsed.data.email_consent === "on",
        evidence: context.evidence,
      });
      // Voltou para corrigir e trocou o e-mail: o cadastro com o e-mail errado não fica para trás.
      const previous = await getPending(context.previousLeadId);
      if (previous && previous.id !== leadId) await repo.deletePending(previous.id);
      return { leadId };
    },

    getPending,

    markAccount: repo.markAccount,
    markDoneByCompany: repo.markDoneByCompany,
    listRecent: repo.listRecent,
  };
}

export type SignupFlowService = ReturnType<typeof createSignupFlowService>;
