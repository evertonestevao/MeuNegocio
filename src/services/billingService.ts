import { AppError } from "@/lib/errors";
import type { PaymentGateway } from "@/adapters/payment/PaymentGateway";
import type { NormalizedPaymentEvent, RenewedSubscription } from "@/types/billing";
import type { Plan, Subscription } from "@/types/database";
import { isBetterPlanForOwner, isNoChargePlan, planMonthlyCents, planTermPayments } from "@/config/planFeatures";

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
  /** Assinatura cujo termo (renovado) tinha este id: evento dele é de um termo que já acabou. */
  findSubscriptionByEndedExternalId(externalId: string): Promise<Subscription | null>;
  insertSubscription(data: Partial<Subscription>): Promise<Subscription>;
  updateSubscription(id: string, data: Partial<Subscription>): Promise<Subscription>;
  /** Membros ativos (deleted_at null) — cada um ocupa um seat. */
  countActiveMembers(companyId: string): Promise<number>;
  /** Convites pendentes também reservam seat (o convidado vai entrar). */
  countPendingInvites(companyId: string): Promise<number>;
  /** A empresa já teve alguma assinatura, inclusive teste ou histórico apagado? Teste grátis é um só. */
  /** Por dono: o dono da empresa já testou ou assinou em alguma empresa dele? */
  ownerHasSubscriptionHistory(companyId: string): Promise<boolean>;
  /** Ativa o plano piloto da empresa (função do banco, que reconfere plano, proprietário e e-mail liberado). */
  activatePilot(params: { companyId: string; planId: string; userId: string }): Promise<Subscription>;
  /** Encerra o piloto: a assinatura vai para o histórico e o e-mail dos proprietários sai da lista do plano. */
  endPilot(params: { companyId: string; actorId: string }): Promise<EndedPilot>;
}

/** O que o encerramento do piloto fez, para a auditoria. */
export interface EndedPilot {
  subscriptionId: string;
  planId: string;
  removedEmails: string[];
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
  /** Nada foi aplicado (evento de termo já encerrado, ou sem assinatura correspondente): não vai para a auditoria. */
  ignored?: boolean;
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

/**
 * Assinatura do plano piloto: ativa, sem gateway e sem data de fim. Dá acesso enquanto existir, e só o
 * super admin a encerra. Não é paga: fica fora da receita, da troca de plano e do cancelamento.
 */
export function isPilotSubscription(subscription: Subscription | null): boolean {
  return (
    subscription !== null &&
    subscription.status === "active" &&
    subscription.renews &&
    !subscription.external_subscription_id &&
    subscription.current_period_end === null
  );
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
      // Evento de um termo que já foi renovado (o id agora é o do termo novo): repetido, atrasado ou o
      // aviso de que o termo antigo foi encerrado. Não é assinatura nova (tratá-lo assim duplicaria a
      // linha e a renovação) nem cancelamento do cliente: não muda nada e não entra na auditoria.
      if (await repo.findSubscriptionByEndedExternalId(event.externalSubscriptionId)) return { ignored: true };
      if (event.type !== "subscription.activated") return { ignored: true }; // evento órfão: nada a atualizar
      if (!event.companyId || !event.planId) {
        // Ativação que não dá para atribuir a uma empresa/plano: ignora em vez de falhar.
        // Falhar aqui travaria a fila sequencial do gateway e seguraria os próximos eventos.
        console.warn(`[billing] ativação ignorada sem company_id/plan_id (gateway=${event.gateway}, sub=${event.externalSubscriptionId ?? "-"})`);
        return { ignored: true };
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
        payment_method_token: event.paymentMethodToken ?? previous?.payment_method_token ?? null,
        // O termo anterior acabou: evento dele, daqui em diante, é ignorado (inclui o que foi trocado de plano).
        ended_external_ids: previous
          ? [...(previous.ended_external_ids ?? []), ...(previous.external_subscription_id ? [previous.external_subscription_id] : [])]
          : [],
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
      case "subscription.updated": {
        // O período nunca anda para trás: no cartão, o PAYMENT_RECEIVED de uma cobrança chega ~30 dias
        // depois do CONFIRMED, quando a cobrança seguinte já pode ter estendido o acesso.
        const olderPeriod =
          event.currentPeriodEnd !== null &&
          existing.current_period_end !== null &&
          new Date(event.currentPeriodEnd) < new Date(existing.current_period_end);
        await repo.updateSubscription(existing.id, {
          // Teste em andamento (trialEndsAt) segue "em teste"; evento duplicado de
          // cobrança criada não antecipa a ativação. Sem teste, fica ativa.
          status: event.trialEndsAt ? "trialing" : "active",
          plan_id: event.planId ?? existing.plan_id,
          ...(olderPeriod
            ? {}
            : {
                current_period_start: event.currentPeriodStart ?? existing.current_period_start,
                current_period_end: event.currentPeriodEnd ?? existing.current_period_end,
              }),
          cancel_at_period_end: event.cancelAtPeriodEnd,
          // Cartão vem com o pagamento; evento sem ele não apaga o que já está guardado.
          ...(event.paymentMethodToken ? { payment_method_token: event.paymentMethodToken } : {}),
        });
        break;
      }
      case "subscription.canceled":
        // Troca agendada: o cancelamento é o da assinatura antiga, que foi encerrada de propósito.
        // A assinatura nova já existe no gateway e assume na data; o cliente segue com acesso.
        if (existing.scheduled_external_subscription_id) return { ignored: true };
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
   * Ativa o plano piloto: sem gateway, sem cobrança e sem prazo. O banco reconfere tudo (plano privado de
   * preço 0, ator proprietário, e-mail na lista do plano); aqui só se barra o que não é piloto antes.
   */
  async function activatePilot(companyId: string, plan: Plan | null, userId: string): Promise<Subscription> {
    if (!plan || !plan.is_active || plan.billing_interval !== "month" || !isNoChargePlan(plan)) {
      throw new AppError("not_found", "Plano não encontrado");
    }
    return repo.activatePilot({ companyId, planId: plan.id, userId });
  }

  /** Encerra o piloto da empresa. Os dados dela ficam como estão; sem assinatura válida, ela cai em /assinar. */
  async function endPilot(companyId: string, actorId: string): Promise<EndedPilot> {
    return repo.endPilot({ companyId, actorId });
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
   * Renovação de termo (anual em N parcelas): aponta a assinatura para o novo termo criado
   * no gateway, estendendo o período. Mesma linha (mantém company/plan/preço
   * contratado e o token); o termo antigo no gateway se encerra sozinho. Um evento
   * duplicado do termo antigo não acha mais esta linha (id já trocado), então não
   * renova de novo.
   */
  async function applyRenewal(
    oldExternalSubscriptionId: string,
    renewed: RenewedSubscription,
    newPlanId?: string,
  ): Promise<void> {
    const existing = await repo.findSubscriptionByExternalId(oldExternalSubscriptionId);
    if (!existing) return;
    await repo.updateSubscription(existing.id, {
      status: "active",
      external_subscription_id: renewed.externalSubscriptionId,
      // O termo que acabou entra na lista: evento dele, daqui em diante, é ignorado.
      ended_external_ids: [...(existing.ended_external_ids ?? []), oldExternalSubscriptionId],
      current_period_start: new Date().toISOString(),
      current_period_end: renewed.currentPeriodEnd ?? existing.current_period_end,
      renews: true,
      // Troca agendada que entra agora: o plano muda e o agendamento some.
      ...(newPlanId ? { plan_id: newPlanId, scheduled_plan_id: null, scheduled_change_at: null, scheduled_external_subscription_id: null } : {}),
    });
  }

  /**
   * Renovação do termo (anual em N parcelas): quando o evento traz `termRenewal`, a última parcela do
   * termo foi paga. Cria o próximo termo no gateway com o cartão guardado (sem o cliente pagar ou
   * digitar nada) e aponta a assinatura para ele. Devolve se renovou.
   *
   * O id do evento é o do termo que ACABOU. Depois de renovar, a linha passa a apontar para o termo
   * novo, então um evento repetido do termo velho (ex.: PAYMENT_RECEIVED depois do CONFIRMED) não
   * acha a linha e não renova de novo: sem isso o cliente seria cobrado em dobro.
   */
  async function renewTerm(
    event: NormalizedPaymentEvent,
    gateway: Pick<PaymentGateway, "renewSubscription" | "cancelSubscription">,
  ): Promise<boolean> {
    if (!event.termRenewal || !event.externalSubscriptionId) return false;
    const oldTermId = event.externalSubscriptionId;
    const row = await repo.findSubscriptionByExternalId(oldTermId);
    if (!row) return false;
    // Cartão do gateway ou, na falta dele, o guardado na assinatura. Sem nenhum, o termo acaba
    // em vez de cobrar às cegas.
    const paymentMethodToken = event.termRenewal.paymentMethodToken ?? row.payment_method_token;
    if (!paymentMethodToken) return false;
    // Troca agendada: o próximo termo já nasce no plano novo (valor e parcelas dele).
    const target = row.scheduled_plan_id ? await repo.getPlanById(row.scheduled_plan_id) : null;
    const nextPlan = target && !target.deleted_at && target.is_active ? target : null;
    const termPayments = nextPlan ? planTermPayments(nextPlan) : null;
    const renewed = await gateway.renewSubscription({
      ...event.termRenewal,
      paymentMethodToken,
      ...(nextPlan ? { valueCents: planMonthlyCents(nextPlan), maxPayments: termPayments! > 1 ? termPayments : null } : {}),
      externalReference: `${row.company_id}:${nextPlan?.id ?? row.plan_id}`,
    });
    await applyRenewal(oldTermId, renewed, nextPlan?.id);
    // O termo antigo já cumpriu as parcelas. O Asaas o deixa "ativo" até depois da data, e se ele ainda
    // gerasse uma cobrança, o cliente pagaria o termo velho e o novo. Encerra-o por garantia (o que já
    // foi pago continua registrado). Falhar aqui não desfaz a renovação: só é registrado.
    try {
      await gateway.cancelSubscription(oldTermId);
    } catch (err) {
      console.error(`[billing] termo antigo não encerrado no gateway (sub=${oldTermId}):`, err instanceof Error ? err.message : "erro desconhecido");
    }
    return true;
  }

  /**
   * Agenda a troca para um plano melhor, que vale no fim do período já pago (nada muda hoje).
   * - Plano atual mensal: cria já a assinatura do plano novo no gateway, com a primeira cobrança no fim
   *   do período, e encerra a antiga (o mês corrente já está pago). Se encerrar a antiga falhar, desfaz a
   *   nova para o cliente nunca ficar com duas.
   * - Plano atual em ciclo (parcelas): as parcelas restantes continuam; o próximo termo nasce no plano novo.
   * Só cartão guardado (renovação sem digitar de novo) e assinatura em dia.
   */
  async function scheduleSwitch(
    companyId: string,
    target: Plan,
    gateway: Pick<PaymentGateway, "renewSubscription" | "cancelSubscription">,
  ): Promise<Subscription> {
    const sub = await repo.getActiveSubscription(companyId);
    if (!sub || !sub.renews || sub.status !== "active" || !sub.external_subscription_id) {
      throw new AppError("conflict", "A troca de plano só vale para assinatura ativa com renovação automática.");
    }
    if (sub.scheduled_plan_id) {
      throw new AppError("conflict", "Já existe uma troca agendada. Ela entra no fim do período.");
    }
    if (!sub.payment_method_token || !sub.external_customer_id || !sub.current_period_end) {
      throw new AppError("conflict", "Não há cartão guardado para trocar o plano. Fale com o suporte.");
    }
    const current = await repo.getPlanById(sub.plan_id);
    if (!current) throw new AppError("not_found", "Plano atual não encontrado");
    if (!target.is_active || target.deleted_at) throw new AppError("not_found", "Plano indisponível");
    if (!isBetterPlanForOwner(current, planMonthlyCents(current, sub.contracted_price_cents), target)) {
      throw new AppError("validation_error", "Este plano não está disponível para troca.");
    }
    const changeAt = sub.current_period_end;
    if (new Date(changeAt).getTime() <= Date.now()) {
      throw new AppError("conflict", "O período atual terminou. Aguarde a próxima cobrança para trocar.");
    }

    if (planTermPayments(current) === 1) {
      const termPayments = planTermPayments(target);
      const created = await gateway.renewSubscription({
        externalCustomerId: sub.external_customer_id,
        paymentMethodToken: sub.payment_method_token,
        valueCents: planMonthlyCents(target),
        maxPayments: termPayments > 1 ? termPayments : null,
        nextDueDate: changeAt.slice(0, 10),
        externalReference: `${companyId}:${target.id}`,
      });
      try {
        await gateway.cancelSubscription(sub.external_subscription_id);
      } catch (err) {
        try {
          await gateway.cancelSubscription(created.externalSubscriptionId);
        } catch {
          console.error(`[billing] troca: assinatura nova não desfeita (sub=${created.externalSubscriptionId})`);
        }
        throw err;
      }
      return repo.updateSubscription(sub.id, {
        scheduled_plan_id: target.id,
        scheduled_change_at: changeAt,
        scheduled_external_subscription_id: created.externalSubscriptionId,
      });
    }
    return repo.updateSubscription(sub.id, { scheduled_plan_id: target.id, scheduled_change_at: changeAt });
  }

  return {
    scheduleSwitch,
    getAccessState,
    startCardlessTrial,
    activatePilot,
    endPilot,
    getEffectivePlan,
    canAccessFeature,
    getFeatureLimit,
    applyPaymentEvent,
    applyRenewal,
    renewTerm,
    getSeatUsage,
    syncSeatsWithGateway,
  };
}

export type BillingService = ReturnType<typeof createBillingService>;
