import { z } from "zod";
import type { CompanyLookup, CompanyRegistry } from "@/adapters/companyRegistry/CompanyRegistry";
import { ABUSE_REASONS, OWNERSHIP_STATEMENT } from "@/features/company/declaration";
import { AppError } from "@/lib/errors";
import { digitsOnly } from "@/lib/masks";
import type { RateLimiter } from "@/server/rateLimit";
import type { CnpjCheckResult } from "@/types/database";
import type { RequestEvidence } from "./termsService";

/**
 * Prevenção de fraude no cadastro de empresas. Nada aqui bloqueia quem é honesto: a declaração é um
 * clique, a conferência do CNPJ só sinaliza para o super admin, e a suspensão é decisão dele. Tudo
 * vira prova guardada (tabelas só de inclusão, com cópia dos dados da hora).
 */

/** Palavras que não ajudam a dizer se dois nomes de empresa são a mesma empresa. */
const GENERIC_WORDS = new Set([
  "DE", "DA", "DO", "DAS", "DOS", "E", "EM", "LTDA", "LIMITADA", "ME", "EPP", "EIRELI", "SA", "S", "A", "SS", "MEI",
  "CIA", "COMPANHIA", "EMPRESA", "SERVICOS", "SERVICO", "COMERCIO", "INDUSTRIA", "SOLUCOES", "GRUPO",
]);

function words(text: string): string[] {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 2 && !GENERIC_WORDS.has(word));
}

/** O nome informado bate com a razão social ou o nome fantasia? Metade das palavras basta. */
export function namesMatch(informed: string, official: string, trade: string | null): boolean {
  const informedWords = words(informed);
  if (informedWords.length === 0) return false;
  const known = new Set([...words(official), ...words(trade ?? "")]);
  const found = informedWords.filter((word) => known.has(word)).length;
  return found / informedWords.length >= 0.5;
}

/** O nome de quem declarou aparece no quadro de sócios? Primeiro e último nome no mesmo sócio. */
export function personInPartners(fullName: string, partners: string[]): boolean | null {
  if (partners.length === 0) return null;
  const parts = words(fullName);
  if (parts.length < 2) return false;
  const [first, last] = [parts[0], parts[parts.length - 1]];
  return partners.some((partner) => {
    const partnerWords = new Set(words(partner));
    return partnerWords.has(first) && partnerWords.has(last);
  });
}

export function classifyLookup(lookup: CompanyLookup, informedName: string): CnpjCheckResult {
  if (lookup.status !== "found") return lookup.status;
  if (lookup.record.situation.trim().toUpperCase() !== "ATIVA") return "inactive";
  return namesMatch(informedName, lookup.record.officialName, lookup.record.tradeName) ? "match" : "name_mismatch";
}

export const abuseReportSchema = z.object({
  reason: z.enum(Object.keys(ABUSE_REASONS) as [keyof typeof ABUSE_REASONS, ...(keyof typeof ABUSE_REASONS)[]], { error: "Escolha o motivo." }),
  message: z.string().trim().min(10, "Conte o que aconteceu (pelo menos 10 letras).").max(2000, "Use até 2.000 caracteres."),
  reporterName: z.string().trim().max(120, "Use até 120 caracteres.").transform((value) => value || null),
  reporterContact: z.string().trim().min(5, "Informe um e-mail ou telefone para contato.").max(200, "Use até 200 caracteres."),
  companyName: z.string().trim().max(200, "Use até 200 caracteres.").transform((value) => value || null),
});

export const suspensionReasonSchema = z.string().trim().min(5, "Escreva o motivo (pelo menos 5 letras).").max(1000, "Use até 1.000 caracteres.");

export interface DeclarationRow {
  companyId: string;
  userId: string;
  userName: string;
  userEmail: string;
  companyName: string;
  cnpj: string | null;
  statement: string;
  termsVersionId: string | null;
  evidence: RequestEvidence;
}

export interface CnpjCheckRow {
  companyId: string;
  cnpj: string;
  informedName: string;
  result: CnpjCheckResult;
  officialName: string | null;
  tradeName: string | null;
  situation: string | null;
  openedOn: string | null;
  city: string | null;
  state: string | null;
  declarantInPartners: boolean | null;
  source: string;
}

export interface AbuseReportRow {
  companyId: string | null;
  quoteId: string | null;
  companyName: string | null;
  reason: keyof typeof ABUSE_REASONS;
  message: string;
  reporterName: string | null;
  reporterContact: string;
  evidence: RequestEvidence;
}

export interface CompanyTrustRepository {
  insertDeclaration(row: DeclarationRow): Promise<void>;
  insertCnpjCheck(row: CnpjCheckRow): Promise<void>;
  insertAbuseReport(row: AbuseReportRow): Promise<void>;
  /** Grava o estado na empresa e o evento no histórico. */
  setSuspension(input: { companyId: string; suspend: boolean; reason: string; actorId: string; actorEmail: string }): Promise<void>;
}

interface Deps {
  repo: CompanyTrustRepository;
  registry: CompanyRegistry;
  reportLimiter: RateLimiter;
}

export function createCompanyTrustService({ repo, registry, reportLimiter }: Deps) {
  return {
    /** Declaração de responsabilidade, marcada por quem cadastra a empresa. */
    async declare(row: Omit<DeclarationRow, "statement">, accepted: unknown): Promise<void> {
      if (accepted !== "on") {
        throw new AppError("validation_error", "Para continuar, marque a declaração de que é responsável pela empresa.");
      }
      await repo.insertDeclaration({ ...row, statement: OWNERSHIP_STATEMENT });
    },

    /**
     * Confere o CNPJ na base pública e guarda a conclusão. Não bloqueia: a base pode estar fora do ar
     * ou o nome fantasia ser outro. Quem decide é o super admin, olhando o sinal.
     */
    async checkCnpj(input: { companyId: string; cnpj: string; informedName: string; declarantName: string }): Promise<CnpjCheckResult> {
      const cnpj = digitsOnly(input.cnpj);
      const lookup = await registry.lookup(cnpj);
      const result = classifyLookup(lookup, input.informedName);
      const record = lookup.status === "found" ? lookup.record : null;
      await repo.insertCnpjCheck({
        companyId: input.companyId,
        cnpj,
        informedName: input.informedName,
        result,
        officialName: record?.officialName ?? null,
        tradeName: record?.tradeName ?? null,
        situation: record?.situation ?? null,
        openedOn: record?.openedOn ?? null,
        city: record?.city ?? null,
        state: record?.state ?? null,
        declarantInPartners: record ? personInPartners(input.declarantName, record.partnerNames) : null,
        source: registry.name,
      });
      return result;
    },

    /** Denúncia pública, sem login. Campo escondido preenchido é robô: responde normal e não grava. */
    async report(input: Record<string, unknown>, context: { companyId: string | null; quoteId: string | null; evidence: RequestEvidence }): Promise<void> {
      await reportLimiter.consume(`abuse-report:${context.evidence.ipAddress ?? "desconhecido"}`);
      if (typeof input.website === "string" && input.website.trim() !== "") return;
      const parsed = abuseReportSchema.safeParse(input);
      if (!parsed.success) throw new AppError("validation_error", parsed.error.issues[0]?.message ?? "Dados inválidos.");
      await repo.insertAbuseReport({ ...parsed.data, companyId: context.companyId, quoteId: context.quoteId, evidence: context.evidence });
    },

    /** Suspende ou reativa, sempre com motivo. Quem chama já conferiu que é o super admin. */
    async setSuspension(input: { companyId: string; suspend: boolean; reason: unknown; actorId: string; actorEmail: string }): Promise<void> {
      const reason = suspensionReasonSchema.safeParse(input.reason);
      if (!reason.success) throw new AppError("validation_error", reason.error.issues[0]?.message ?? "Motivo inválido.");
      await repo.setSuspension({ ...input, reason: reason.data });
    },
  };
}

export type CompanyTrustService = ReturnType<typeof createCompanyTrustService>;
