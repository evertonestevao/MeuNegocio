import { AppError } from "@/lib/errors";
import type { PaymentGateway } from "@/adapters/payment/PaymentGateway";
import type { NormalizedPaymentEvent, RenewedSubscription } from "@/types/billing";
import type { Plan, Subscription } from "@/types/database";

/**
 * Regras de negócio de billing. Sem I/O direto: o repositório é injetado,
 * o que mantém as regras testáveis (Vitest) e o Supabase trocável.
 */

export interface BillingRepository {
  getPlanById(planId: string): Promise<Plan | null>;
  getPlanByCode(code: string): Promise<Plan | null>;
  /** Assinatura não soft-deletada da empresa (única, por índice parcial). */
  getActiveSubscription(companyId: string): Promise<Subscription | null>;
  findSubscriptionByExternalId(externalId: string): Promise<Subscription | null>;
  insertSubscription(data: Partial<Subscription>): Promise<Subscription>;
  updateSubscription(id: string, data: Partial<Subscription>): Promise<Subscription>;
  /** Membros ativos (deleted_at null) — cada um ocupa um seat. */
  countActiveMembers(companyId: string): Promise<number>;
  /** Convites pendentes também reservam seat (o convidado vai entrar). */
  countPendingInvites(companyId: string): Promise<number>;
  /** A empresa já teve alguma assinatura, inclusive teste ou histórico apagado? Teste grátis é um só. */
  /** Por dono: o dono da empresa já testou ou assinou em alguma empresa dele? */
  ownerHasSubscriptionHistory(companyId: string): Promise<boolean>;
}

/** Fotografia do uso de seats de uma empresa. */
export interface SeatUsage {
  /** Seats inclusos no plano (features.max_members); null = ilimitado. */
  included: number | null;
  /** Seats em uso: membros ativos + convites pendentes. */
  used: number;
  /** Seats além do incluso (0 quando ilimitado ou dentro do limite). */
  extraSeats: number;
  /** Custo mensal dos extras em centavos (extraSeats * preço contratado). */
  extraCostCents: number;
  /** false quando as vagas acabaram e o plano não vende membro extra. */
  canAddSeat: boolean;
}

export interface PaymentEventResult {
  /** Assinatura encerrada por estorno, para o chamador registrar e encerrar vínculos. */
  endedSubscription?: Subscription;
}

/** Plano usado quando a empresa não tem assinatura ativa. */
export const DEFAULT_PLAN_CODE = "free";

/** Teste grátis: dias e plano, com tudo liberado. */
export const TRIAL_DAYS = 7;
export const TRIAL_PLAN_CODE = "pro";
/**
 * Teste sem cartão oferecido na tela de assinar. Desligado por decisão comercial: por enquanto só o
 * teste de 7 dias com cartão. Quem já está num teste sem cartão segue até o fim dele.
 */
export const CARDLESS_TRIAL_OFFERED = false;

/** Teste sem cartão: assinatura em teste, sem gateway, que não renova e acaba no fim do período. */
export function isCardlessTrial(subscription: Subscription | null): boolean {
  return subscription !== null && subscription.status === "trialing" && !subscription.renews && !subscription.external_subscription_id;
}

/** Como a empresa está: com acesso, em teste (e até quando) ou sem assinatura, e se ainda pode testar. */
export interface AccessState {
  hasAccess: boolean;
  /** Teste sem cartão em andamento: termina em trialEndsAt. */
  inCardlessTrial: boolean;
  trialEndsAt: string | null;
  /** Ainda não usou o teste grátis. */
  trialAvailable: boolean;
}

export function trialEndsAt(now: Date = new Date()): string {
  return new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

/** Status de assinatura que dão acesso às features do plano. */
const ACCESS_STATUSES: ReadonlySet<Subscription["status"]> = new Set([
  "trialing",
  "active",
  "past_due", // carência: acesso mantido enquanto o gateway tenta cobrar
]);

/**
 * A assinatura dá acesso ao plano agora? Cancelada ou parcelada, que não renova,
 * mantém o plano até o fim do período. Mesma regra de public.company_plan_terms, no banco.
 */
export function hasPlanAccess(subscription: Subscription, now: Date = new Date()): boolean {
  const withinPeriod = subscription.current_period_end !== null && new Date(subscription.current_period_end) > now;
  if (subscription.status === "canceled") return withinPeriod;
  if (!ACCESS_STATUSES.has(subscription.status)) return false;
  return subscription.renews || withinPeriod;
}

export function createBillingService(repo: BillingRepository) {
  /** Plano efetivo da empresa: o da assinatura válida, senão o plano free. */
  async function getEffectivePlan(companyId: string): Promise<Plan | null> {
    const subscription = await repo.getActiveSubscription(companyId);
    if (subscription && hasPlanAccess(subscription)) {
      const plan = await repo.getPlanById(subscription.plan_id);
      if (plan) return plan;
    }
    return repo.getPlanByCode(DEFAULT_PLAN_CODE);
  }

  /** Preços que valem para a empresa: os contratados, ou os do plano free sem assinatura. */
  async function getEffectivePrices(
    companyId: string,
    plan: Plan | null,
  ): Promise<{ baseCents: number; extraSeatCents: number }> {
    const subscription = await repo.getActiveSubscription(companyId);
    if (subscription && hasPlanAccess(subscription)) {
      return {
        baseCents: subscription.contracted_price_cents,
        extraSeatCents: subscription.contracted_extra_seat_price_cents,
      };
    }
    return { baseCents: plan?.price_cents ?? 0, extraSeatCents: plan?.extra_seat_price_cents ?? 0 };
  }

  /**
   * Ponto ÚNICO de checagem de feature/limite por plano (plano §9).
   * - valor booleano em plan.features: retorna ele
   * - valor numérico: true se > 0 (o limite em si vem de getFeatureLimit)
   * - ausente: false (feature não incluída no plano)
   */
  async function canAccessFeature(companyId: string, featureKey: string): Promise<boolean> {
    const plan = await getEffectivePlan(companyId);
    const value = plan?.features[featureKey];
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value > 0;
    return false;
  }

  /** Limite numérico da feature no plano efetivo (null = sem limite definido). */
  async function getFeatureLimit(companyId: string, featureKey: string): Promise<number | null> {
    const plan = await getEffectivePlan(companyId);
    const value = plan?.features[featureKey];
    return typeof value === "number" ? value : null;
  }

  /**
   * Aplica um evento normalizado de webhook à tabela subscriptions.
   * Idempotente por externalSubscriptionId: evento repetido só re-grava o
   * mesmo estado. Chamado apenas no servidor (service_role), pois webhook
   * não tem sessão de usuário.
   */
  async function applyPaymentEvent(
    event: NormalizedPaymentEvent,
    gateway?: Pick<PaymentGateway, "cancelSubscription">,
  ): Promise<PaymentEventResult> {
    if (event.type === "ignored") return {};
    if (event.type === "payment.refunded") return endSubscriptionAfterRefund(event, gateway);
    if (!event.externalSubscriptionId) {
      throw new AppError("payment_error", "Evento de pagamento sem id de assinatura");
    }

    const existing = await repo.findSubscriptionByExternalId(event.externalSubscriptionId);

    if (!existing) {
      if (event.type !== "subscription.activated") return {}; // evento órfão: nada a atualizar
      if (!event.companyId || !event.planId) {
        // Ativação que não dá para atribuir a uma empresa/plano: ignora em vez de falhar.
        // Falhar aqui travaria a fila sequencial do gateway e seguraria os próximos eventos.
        console.warn(`[billing] ativação ignorada sem company_id/plan_id (gateway=${event.gateway}, sub=${event.externalSubscriptionId ?? "-"})`);
        return {};
      }
      // Reassinatura: a assinatura anterior (ex.: cancelada) ainda ocupa o índice
      // único por empresa. Vai para o histórico para a nova poder entrar.
      const previous = await repo.getActiveSubscription(event.companyId);
      if (previous) {
        await repo.updateSubscription(previous.id, { deleted_at: new Date().toISOString() });
      }
      await repo.insertSubscription({
        company_id: event.companyId,
        plan_id: event.planId,
        // Teste com cartão: o gateway só cobra no fim do teste.
        status: event.trialEndsAt ? "trialing" : "active",
        external_subscription_id: event.externalSubscriptionId,
        external_customer_id: event.externalCustomerId,
        current_period_start: event.currentPeriodStart,
        current_period_end: event.currentPeriodEnd,
        cancel_at_period_end: event.cancelAtPeriodEnd,
        renews: !event.nonRenewing,
        // Multigateway + renovação do termo anual (token do cartão).
        gateway_provider: event.gatewayProvider ?? event.gateway,
        payment_method_token: event.paymentMethodToken ?? null,
      });
      return {};
    }

    // Cada parcela confirmada chega como um evento: o período é o da compra e não muda, e
    // parcela atrasada que chega depois de um estorno não reabre o acesso.
    if (!existing.renews && (event.type === "subscription.activated" || event.type === "subscription.updated")) {
      if (existing.status === "past_due") await repo.updateSubscription(existing.id, { status: "active" });
      return {};
    }

    switch (event.type) {
      case "subscription.activated":
      case "subscription.updated":
        await repo.updateSubscription(existing.id, {
          // Teste em andamento (trialEndsAt) segue "em teste"; evento duplicado de
          // cobrança criada não antecipa a ativação. Sem teste, fica ativa.
          status: event.trialEndsAt ? "trialing" : "active",
          plan_id: event.planId ?? existing.plan_id,
          current_period_start: event.currentPeriodStart ?? existing.current_period_start,
          current_period_end: event.currentPeriodEnd ?? existing.current_period_end,
          cancel_at_period_end: event.cancelAtPeriodEnd,
        });
        break;
      case "subscription.canceled":
        await repo.updateSubscription(existing.id, { status: "canceled" });
        break;
      case "payment.failed":
        await repo.updateSubscription(existing.id, { status: "past_due" });
        break;
    }
    return {};
  }

  /**
   * Estorno integral da cobrança do período atual encerra a assinatura na hora: o
   * período deixou de estar pago. Parcial ou de cobrança antiga não muda nada, para
   * uma correção de valor não derrubar quem está em dia. Sem saber a qual período o
   * estorno se refere, também não muda. Na compra parcelada, todas as parcelas são do
   * mesmo período, então qualquer estorno integral encerra.
   */
  async function endSubscriptionAfterRefund(
    event: NormalizedPaymentEvent,
    gateway?: Pick<PaymentGateway, "cancelSubscription">,
  ): Promise<PaymentEventResult> {
    if (!event.refund || event.refund.refundedCents !== null) return {};
    if (!event.externalSubscriptionId) return {};

    const subscription = await repo.findSubscriptionByExternalId(event.externalSubscriptionId);
    if (!subscription) return {};
    if (subscription.renews) {
      if (!event.currentPeriodStart || !subscription.current_period_start) return {};
      if (new Date(event.currentPeriodStart) < new Date(subscription.current_period_start)) return {};
    }

    // Antes de gravar: se o gateway falhar, o webhook é reenviado e tenta de novo.
    // Assinatura já cancelada não tem mais o que parar no gateway.
    if (subscription.renews && subscription.status !== "canceled") {
      if (!gateway) throw new AppError("payment_error", "Estorno sem gateway para encerrar a assinatura");
      await gateway.cancelSubscription(event.externalSubscriptionId);
    }
    const ended = await repo.updateSubscription(subscription.id, {
      status: "canceled",
      cancel_at_period_end: false,
      current_period_end: new Date().toISOString(),
    });
    return { endedSubscription: ended };
  }

  /**
   * Uso de seats da empresa (billing por assento). Exceder o incluso vira
   * cobrança extra; sem preço de extra, não há como exceder e o convite é
   * recusado. Limite ausente/não numérico = ilimitado.
   */
  async function getSeatUsage(companyId: string): Promise<SeatUsage> {
    const [plan, members, invites] = await Promise.all([
      getEffectivePlan(companyId),
      repo.countActiveMembers(companyId),
      repo.countPendingInvites(companyId),
    ]);
    const { extraSeatCents } = await getEffectivePrices(companyId, plan);
    const used = members + invites;
    const rawIncluded = plan?.features["max_members"];
    const included = typeof rawIncluded === "number" ? rawIncluded : null;
    const extraSeats = included === null ? 0 : Math.max(0, used - included);
    return {
      included,
      used,
      extraSeats,
      extraCostCents: extraSeats * extraSeatCents,
      canAddSeat: included === null || used < included || extraSeatCents > 0,
    };
  }

  /**
   * Recalcula os seats extras e sincroniza a quantidade no gateway.
   * Sem assinatura ativa (plano free) ou já cancelada não há o que cobrar — no-op.
   * Chamar após convite criado/revogado e membro removido.
   */
  async function syncSeatsWithGateway(
    companyId: string,
    gateway: PaymentGateway,
    extraSeatExternalPriceId: string | null,
  ): Promise<SeatUsage> {
    const usage = await getSeatUsage(companyId);
    const subscription = await repo.getActiveSubscription(companyId);
    if (
      subscription &&
      subscription.renews &&
      ACCESS_STATUSES.has(subscription.status) &&
      subscription.external_subscription_id
    ) {
      await gateway.syncExtraSeats({
        externalSubscriptionId: subscription.external_subscription_id,
        quantity: usage.extraSeats,
        unitPriceCents: subscription.contracted_extra_seat_price_cents,
        basePriceCents: subscription.contracted_price_cents,
        externalPriceId: extraSeatExternalPriceId,
      });
    }
    return usage;
  }

  /** Sem assinatura válida, a empresa vê a tela de assinar; o teste grátis só aparece uma vez. */
  async function getAccessState(companyId: string, now: Date = new Date()): Promise<AccessState> {
    const subscription = await repo.getActiveSubscription(companyId);
    const hasAccess = subscription !== null && hasPlanAccess(subscription, now);
    const cardless = hasAccess && isCardlessTrial(subscription);
    return {
      hasAccess,
      inCardlessTrial: cardless,
      trialEndsAt: cardless ? subscription!.current_period_end : null,
      trialAvailable: !(await repo.ownerHasSubscriptionHistory(companyId)),
    };
  }

  /**
   * Teste de 7 dias sem cartão, com o plano completo. Um por DONO (não por empresa:
   * criar empresa não tem limite). Grava com service_role: quem chama já conferiu
   * que o ator é o proprietário.
   */
  async function startCardlessTrial(companyId: string, now: Date = new Date()): Promise<Subscription> {
    if (await repo.ownerHasSubscriptionHistory(companyId)) {
      throw new AppError("conflict", "Você já usou o teste grátis. Assine para continuar.");
    }
    const plan = await repo.getPlanByCode(TRIAL_PLAN_CODE);
    if (!plan) throw new AppError("internal_error", "Plano do teste não encontrado", TRIAL_PLAN_CODE);
    return repo.insertSubscription({
      company_id: companyId,
      plan_id: plan.id,
      status: "trialing",
      current_period_start: now.toISOString(),
      current_period_end: trialEndsAt(now),
      cancel_at_period_end: false,
      renews: false,
      external_subscription_id: null,
      external_customer_id: null,
    });
  }

  /**
   * Renovação de termo (anual em 12x): aponta a assinatura para o novo termo criado
   * no gateway, estendendo o período. Mesma linha (mantém company/plan/preço
   * contratado e o token); o termo antigo no gateway se encerra sozinho. Um evento
   * duplicado do termo antigo não acha mais esta linha (id já trocado), então não
   * renova de novo.
   */
  async function applyRenewal(
    oldExternalSubscriptionId: string,
    renewed: RenewedSubscription,
  ): Promise<void> {
    const existing = await repo.findSubscriptionByExternalId(oldExternalSubscriptionId);
    if (!existing) return;
    await repo.updateSubscription(existing.id, {
      status: "active",
      external_subscription_id: renewed.externalSubscriptionId,
      current_period_start: new Date().toISOString(),
      current_period_end: renewed.currentPeriodEnd ?? existing.current_period_end,
      renews: true,
    });
  }

  return {
    getAccessState,
    startCardlessTrial,
    getEffectivePlan,
    canAccessFeature,
    getFeatureLimit,
    applyPaymentEvent,
    applyRenewal,
    getSeatUsage,
    syncSeatsWithGateway,
  };
}

export type BillingService = ReturnType<typeof createBillingService>;
