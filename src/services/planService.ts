import { PLAN_FEATURES } from "@/config/planFeatures";
import { AppError } from "@/lib/errors";
import type { Plan, PlanAuditEntry } from "@/types/database";
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
}

export interface PlanRepository {
  list(): Promise<Plan[]>;
  getById(id: string): Promise<Plan | null>;
  getByCode(code: string): Promise<Plan | null>;
  save(params: { planId: string | null; code: string; input: PlanInput; actorId: string }): Promise<Plan>;
  setActive(params: { planId: string; isActive: boolean; actorId: string }): Promise<Plan>;
  listAudit(limit: number): Promise<PlanAuditEntry[]>;
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
  }

  return {
    list: () => repo.list(),
    /** Só o que está à venda: plano desativado some da oferta. */
    listActive: async () => (await repo.list()).filter((plan) => plan.is_active),
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
