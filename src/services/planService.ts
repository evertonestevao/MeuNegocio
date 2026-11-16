import { PLAN_FEATURES } from "@/config/planFeatures";
import { PAYMENT_METHOD_KEYS } from "@/config/paymentMethods";
import { AppError } from "@/lib/errors";
import type { Plan, PlanAccessEntry, PlanAuditEntry } from "@/types/database";
import { DEFAULT_PLAN_CODE } from "./billingService";

/**
 * Regras do catálogo de planos, operado pelo super_admin em /admin/planos. Quem chama já
 * revalidou o papel no servidor. A escrita e o histórico acontecem juntos, no repositório.
 */

export interface PlanInput {
  name: string;
  priceCents: number;
  extraSeatPriceCents: number;
  features: Record<string, number | boolean | null>;
  customText: string | null;
  paymentMethods: string[];
  trialDays: number;
  /** false = plano privado, visível só para os e-mails liberados. */
  isPublic: boolean;
}

/** Limite de e-mails por pedido: evita colar uma lista enorme sem querer. */
export const MAX_ACCESS_EMAILS_PER_REQUEST = 200;
const EMAIL_PATTERN = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

/**
 * Lê e-mails de um texto livre (separados por espaço, vírgula, ponto e vírgula ou quebra de linha),
 * em minúsculas e sem repetição. Qualquer item que não seja e-mail recusa o pedido inteiro, para o
 * super admin corrigir em vez de liberar só parte da lista sem perceber.
 */
export function parseAccessEmails(raw: string): string[] {
  const emails = [...new Set(raw.split(/[\s,;]+/).map((item) => item.trim().toLowerCase()).filter(Boolean))];
  if (emails.length === 0) throw new AppError("validation_error", "Informe ao menos um e-mail");
  if (emails.length > MAX_ACCESS_EMAILS_PER_REQUEST) {
    throw new AppError("validation_error", `Use até ${MAX_ACCESS_EMAILS_PER_REQUEST} e-mails por vez`);
  }
  const invalid = emails.find((email) => email.length > 254 || !EMAIL_PATTERN.test(email));
  if (invalid) throw new AppError("validation_error", `E-mail inválido: ${invalid}`);
  return emails;
}

export interface PlanRepository {
  list(): Promise<Plan[]>;
  getById(id: string): Promise<Plan | null>;
  getByCode(code: string): Promise<Plan | null>;
  save(params: { planId: string | null; code: string; input: PlanInput; actorId: string }): Promise<Plan>;
  setActive(params: { planId: string; isActive: boolean; actorId: string }): Promise<Plan>;
  listAudit(limit: number): Promise<PlanAuditEntry[]>;
  listAccess(): Promise<PlanAccessEntry[]>;
  /** Libera ou remove e-mails e devolve só os que de fato mudaram. */
  setAccess(params: { planId: string; emails: string[]; grant: boolean; actorId: string }): Promise<string[]>;
}

function assertKnownFeatures(features: PlanInput["features"]): void {
  const known = new Map(PLAN_FEATURES.map((feature) => [feature.key, feature.type]));
  for (const [key, value] of Object.entries(features)) {
    const type = known.get(key);
    const valid =
      type === "flag"
        ? typeof value === "boolean"
        : type === "limit" && (value === null || (Number.isInteger(value) && Number(value) >= 0));
    if (!valid) throw new AppError("validation_error", "Limite ou recurso inválido no plano");
  }
  if (PLAN_FEATURES.some((feature) => !(feature.key in features))) {
    throw new AppError("validation_error", "Preencha todos os limites e recursos do plano");
  }
}

export function createPlanService(repo: PlanRepository) {
  function validate(code: string, input: PlanInput): void {
    assertKnownFeatures(input.features);
    // O plano padrão vale para quem não tem assinatura, então não há como cobrá-lo.
    if (code === DEFAULT_PLAN_CODE && (input.priceCents !== 0 || input.extraSeatPriceCents !== 0)) {
      throw new AppError("validation_error", "O plano padrão, sem assinatura, precisa ser gratuito");
    }
    if (input.paymentMethods.length === 0) {
      throw new AppError("validation_error", "Escolha ao menos um meio de pagamento para o plano");
    }
    if (!input.paymentMethods.every((method) => PAYMENT_METHOD_KEYS.includes(method as never))) {
      throw new AppError("validation_error", "Meio de pagamento inválido no plano");
    }
    if (code === DEFAULT_PLAN_CODE && !input.isPublic) {
      throw new AppError("validation_error", "O plano padrão, sem assinatura, não pode ser privado");
    }
    if (!Number.isInteger(input.trialDays) || input.trialDays < 0 || input.trialDays > 90) {
      throw new AppError("validation_error", "Dias de teste: use um número de 0 a 90");
    }
  }

  return {
    list: () => repo.list(),
    /** Plano ativo, público ou não. Uso interno do painel (ex.: dar um plano ao criar uma empresa). */
    listActive: async () => (await repo.list()).filter((plan) => plan.is_active),
    /** Só o que qualquer visitante pode ver: plano desativado ou privado some da oferta. */
    listPublicActive: async () => (await repo.list()).filter((plan) => plan.is_active && plan.is_public),
    listAccess: () => repo.listAccess(),
    listAudit: (limit = 30) => repo.listAudit(limit),

    async create(code: string, input: PlanInput, actorId: string): Promise<Plan> {
      validate(code, input);
      if (await repo.getByCode(code)) {
        throw new AppError("conflict", "Já existe um plano com esse código");
      }
      return repo.save({ planId: null, code, input, actorId });
    },

    /** O code não entra aqui: ele não muda depois de criado. */
    async update(planId: string, input: PlanInput, actorId: string): Promise<Plan> {
      const plan = await repo.getById(planId);
      if (!plan) throw new AppError("not_found", "Plano não encontrado");
      validate(plan.code, input);
      return repo.save({ planId, code: plan.code, input, actorId });
    },

    /** Libera e-mails para ver um plano privado. Devolve os que foram adicionados agora. */
    async grantAccess(planId: string, rawEmails: string, actorId: string): Promise<string[]> {
      const emails = parseAccessEmails(rawEmails);
      const plan = await repo.getById(planId);
      if (!plan) throw new AppError("not_found", "Plano não encontrado");
      if (plan.is_public) {
        throw new AppError("validation_error", "Só plano privado tem lista de e-mails. Marque o plano como privado primeiro");
      }
      return repo.setAccess({ planId, emails, grant: true, actorId });
    },

    /** Tira o e-mail da lista. Quem já assina o plano continua nele. */
    async revokeAccess(planId: string, rawEmail: string, actorId: string): Promise<string[]> {
      const emails = parseAccessEmails(rawEmail);
      const plan = await repo.getById(planId);
      if (!plan) throw new AppError("not_found", "Plano não encontrado");
      return repo.setAccess({ planId, emails, grant: false, actorId });
    },

    /** Desativar tira o plano da oferta; quem já assina continua nele. */
    async setActive(planId: string, isActive: boolean, actorId: string): Promise<Plan> {
      const plan = await repo.getById(planId);
      if (!plan) throw new AppError("not_found", "Plano não encontrado");
      if (!isActive && plan.code === DEFAULT_PLAN_CODE) {
        throw new AppError("validation_error", "O plano padrão não pode ser desativado");
      }
      return repo.setActive({ planId, isActive, actorId });
    },
  };
}

export type PlanService = ReturnType<typeof createPlanService>;
