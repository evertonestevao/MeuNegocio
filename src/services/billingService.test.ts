import { describe, expect, it, vi } from "vitest";
import type { ExtraSeatsUpdate, NormalizedPaymentEvent } from "@/types/billing";
import type { Plan, Subscription } from "@/types/database";
import {
  createBillingService,
  DEFAULT_PLAN_CODE,
  hasPlanAccess,
  type BillingRepository,
  isCardlessTrial,
  isPilotSubscription,
} from "./billingService";

function makePlan(overrides: Partial<Plan>): Plan {
  return {
    id: "plan-1",
    code: "pro",
    name: "Pro",
    price_cents: 9900,
    currency: "BRL",
    billing_interval: "month",
    features: {},
    extra_seat_price_cents: 0,
    custom_text: null,
    payment_methods: ["credit_card"],
    trial_days: 7,
    is_public: true,
    term_payments: 12,
    is_active: true,
    deleted_at: null,
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

function makeSubscription(overrides: Partial<Subscription>): Subscription {
  return {
    id: "sub-1",
    company_id: "company-1",
    plan_id: "plan-1",
    status: "active",
    current_period_start: null,
    current_period_end: null,
    cancel_at_period_end: false,
    external_subscription_id: "ext-1",
    external_customer_id: "cus-1",
    contracted_price_cents: 9900,
    contracted_extra_seat_price_cents: 1990,
    renews: true,
    gateway_provider: "asaas",
    payment_method_token: null,
    ended_external_ids: [],
    scheduled_plan_id: null,
    scheduled_change_at: null,
    scheduled_external_subscription_id: null,
    deleted_at: null,
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

/** Repositório em memória para testar as regras sem Supabase. */
function makeRepo(state: {
  plans: Plan[];
  subscriptions: Subscription[];
  members?: number;
  pendingInvites?: number;
}): BillingRepository {
  return {
    async countActiveMembers() {
      return state.members ?? 0;
    },
    async countPendingInvites() {
      return state.pendingInvites ?? 0;
    },
    async getPlanById(id) {
      return state.plans.find((p) => p.id === id) ?? null;
    },
    async getPlanByCode(code) {
      return state.plans.find((p) => p.code === code) ?? null;
    },
    async getActiveSubscription(companyId) {
      return (
        state.subscriptions.find((s) => s.company_id === companyId && !s.deleted_at) ?? null
      );
    },
    async findSubscriptionByExternalId(externalId) {
      return (
        state.subscriptions.find(
          (s) => s.external_subscription_id === externalId && !s.deleted_at,
        ) ?? null
      );
    },
    async findSubscriptionByEndedExternalId(externalId) {
      return state.subscriptions.find((s) => s.ended_external_ids.includes(externalId) && !s.deleted_at) ?? null;
    },
    async insertSubscription(data) {
      const row = makeSubscription({ ...data, id: `sub-${state.subscriptions.length + 1}` });
      state.subscriptions.push(row);
      return row;
    },
    async updateSubscription(id, data) {
      const row = state.subscriptions.find((s) => s.id === id);
      if (!row) throw new Error("not found");
      Object.assign(row, data);
      return row;
    },
    async activatePilot({ companyId, planId }) {
      const row = makeSubscription({
        id: `sub-${state.subscriptions.length + 1}`,
        company_id: companyId,
        plan_id: planId,
        external_subscription_id: null,
        external_customer_id: null,
        gateway_provider: null,
        contracted_price_cents: 0,
        current_period_end: null,
      });
      state.subscriptions.push(row);
      return row;
    },
    async endPilot({ companyId }) {
      const row = state.subscriptions.find((s) => s.company_id === companyId && !s.deleted_at);
      if (!row) throw new Error("pilot_not_found");
      Object.assign(row, { status: "canceled", current_period_end: new Date().toISOString(), renews: false, deleted_at: new Date().toISOString() });
      return { subscriptionId: row.id, planId: row.plan_id, removedEmails: [] };
    },
    async ownerHasSubscriptionHistory(companyId) {
      // No teste há uma empresa só, então por-dono e por-empresa coincidem; a
      // lógica real por-dono vive na função do banco (coberta no teste de RLS).
      return state.subscriptions.some((s) => s.company_id === companyId);
    },
  };
}

describe("applyPaymentEvent: reassinatura", () => {
  it("arquiva a assinatura cancelada e cria a nova com outro id externo", async () => {
    const canceled = makeSubscription({ status: "canceled", external_subscription_id: "ext-old" });
    const state = { plans: [makePlan({})], subscriptions: [canceled] };
    const service = createBillingService(makeRepo(state));

    await service.applyPaymentEvent({
      type: "subscription.activated",
      gateway: "asaas",
      externalSubscriptionId: "ext-new",
      externalCustomerId: "cus-1",
      companyId: "company-1",
      planId: "plan-1",
      currentPeriodStart: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    });

    expect(canceled.deleted_at).not.toBeNull();
    const active = state.subscriptions.filter((s) => !s.deleted_at);
    expect(active).toHaveLength(1);
    expect(active[0]).toMatchObject({ external_subscription_id: "ext-new", status: "active" });
  });
});

describe("canAccessFeature", () => {
  const proPlan = makePlan({
    id: "plan-pro",
    code: "pro",
    features: { api_access: true, max_members: 10, reports: false },
  });
  const freePlan = makePlan({
    id: "plan-free",
    code: DEFAULT_PLAN_CODE,
    features: { max_members: 2 },
  });

  it("libera feature booleana true do plano da assinatura ativa", async () => {
    const service = createBillingService(
      makeRepo({
        plans: [proPlan, freePlan],
        subscriptions: [makeSubscription({ plan_id: "plan-pro" })],
      }),
    );
    expect(await service.canAccessFeature("company-1", "api_access")).toBe(true);
  });

  it("nega feature booleana false e feature ausente", async () => {
    const service = createBillingService(
      makeRepo({
        plans: [proPlan, freePlan],
        subscriptions: [makeSubscription({ plan_id: "plan-pro" })],
      }),
    );
    expect(await service.canAccessFeature("company-1", "reports")).toBe(false);
    expect(await service.canAccessFeature("company-1", "sso")).toBe(false);
  });

  it("trata limite numérico como acessível quando > 0", async () => {
    const service = createBillingService(
      makeRepo({
        plans: [proPlan, freePlan],
        subscriptions: [makeSubscription({ plan_id: "plan-pro" })],
      }),
    );
    expect(await service.canAccessFeature("company-1", "max_members")).toBe(true);
    expect(await service.getFeatureLimit("company-1", "max_members")).toBe(10);
  });

  it("cai para o plano free quando não há assinatura", async () => {
    const service = createBillingService(
      makeRepo({ plans: [proPlan, freePlan], subscriptions: [] }),
    );
    expect(await service.canAccessFeature("company-1", "api_access")).toBe(false);
    expect(await service.getFeatureLimit("company-1", "max_members")).toBe(2);
  });

  it("cai para o plano free quando a assinatura está cancelada", async () => {
    const service = createBillingService(
      makeRepo({
        plans: [proPlan, freePlan],
        subscriptions: [makeSubscription({ plan_id: "plan-pro", status: "canceled" })],
      }),
    );
    expect(await service.canAccessFeature("company-1", "api_access")).toBe(false);
  });

  it("assinatura cancelada mantém o plano até o fim do período pago", async () => {
    const canceledUntil = (end: string | null) =>
      createBillingService(
        makeRepo({
          plans: [proPlan, freePlan],
          subscriptions: [
            makeSubscription({ plan_id: "plan-pro", status: "canceled", current_period_end: end }),
          ],
        }),
      ).canAccessFeature("company-1", "api_access");

    expect(await canceledUntil(new Date(Date.now() + 86_400_000).toISOString())).toBe(true);
    expect(await canceledUntil(new Date(Date.now() - 86_400_000).toISOString())).toBe(false);
    expect(await canceledUntil(null)).toBe(false);
  });

  it("mantém acesso em past_due (carência de cobrança)", async () => {
    const service = createBillingService(
      makeRepo({
        plans: [proPlan, freePlan],
        subscriptions: [makeSubscription({ plan_id: "plan-pro", status: "past_due" })],
      }),
    );
    expect(await service.canAccessFeature("company-1", "api_access")).toBe(true);
  });
});

describe("getSeatUsage / syncSeatsWithGateway (billing por seat)", () => {
  const threeSeatPlan = makePlan({
    id: "plan-3seats",
    code: "pro",
    features: { max_members: 3 },
    extra_seat_price_cents: 1990,
  });

  function makeGatewaySpy() {
    const calls: ExtraSeatsUpdate[] = [];
    return {
      calls,
      gateway: {
        name: "spy",
        supportsTrial: false,
        async createCheckout() {
          throw new Error("não usado");
        },
        async cancelSubscription() {},
        async getPortalUrl() {
          return null;
        },
        async handleWebhook() {
          throw new Error("não usado");
        },
        async syncExtraSeats(params: (typeof calls)[number]) {
          calls.push(params);
        },
        async renewSubscription() {
          throw new Error("não usado");
        },
      },
    };
  }

  it("cenário do spec: plano de 3 seats, 4º membro chegando = 1 seat extra, sem bloqueio", async () => {
    // 3 membros ativos + 1 convite pendente (o 4º a caminho) = 4 seats usados
    const service = createBillingService(
      makeRepo({
        plans: [threeSeatPlan],
        subscriptions: [makeSubscription({ plan_id: "plan-3seats" })],
        members: 3,
        pendingInvites: 1,
      }),
    );
    const usage = await service.getSeatUsage("company-1");
    expect(usage).toEqual({
      included: 3,
      used: 4,
      extraSeats: 1,
      extraCostCents: 1990,
      canAddSeat: true,
    });
  });

  it("plano sem preço de extra bloqueia na última vaga, contando convites pendentes", async () => {
    const free = makePlan({
      id: "free",
      code: DEFAULT_PLAN_CODE,
      features: { max_members: 2 },
      extra_seat_price_cents: 0,
    });
    const usageWith = (members: number, pendingInvites: number) =>
      createBillingService(makeRepo({ plans: [free], subscriptions: [], members, pendingInvites })).getSeatUsage("company-1");

    expect((await usageWith(1, 0)).canAddSeat).toBe(true);
    expect((await usageWith(1, 1)).canAddSeat).toBe(false);
    expect((await usageWith(2, 0)).canAddSeat).toBe(false);
    expect((await usageWith(5, 0)).canAddSeat).toBe(false);
  });

  it("plano sem limite numérico nunca bloqueia", async () => {
    const service = createBillingService(
      makeRepo({
        plans: [makePlan({ id: "free", code: DEFAULT_PLAN_CODE, features: { max_members: null } })],
        subscriptions: [],
        members: 50,
      }),
    );
    expect((await service.getSeatUsage("company-1")).canAddSeat).toBe(true);
  });

  it("assinante mantém o preço contratado quando o plano é editado", async () => {
    const { gateway, calls } = makeGatewaySpy();
    const edited = { ...threeSeatPlan, price_cents: 99900, extra_seat_price_cents: 9990 };
    const service = createBillingService(
      makeRepo({
        plans: [edited],
        subscriptions: [
          makeSubscription({
            plan_id: "plan-3seats",
            contracted_price_cents: 14900,
            contracted_extra_seat_price_cents: 1990,
    renews: true,
          }),
        ],
        members: 5,
      }),
    );
    const usage = await service.syncSeatsWithGateway("company-1", gateway, null);
    expect(usage.extraCostCents).toBe(2 * 1990);
    expect(calls[0]).toMatchObject({ unitPriceCents: 1990, basePriceCents: 14900 });
  });

  it("preço de extra contratado zero bloqueia mesmo que o plano passe a vender extra", async () => {
    const service = createBillingService(
      makeRepo({
        plans: [threeSeatPlan],
        subscriptions: [
          makeSubscription({ plan_id: "plan-3seats", contracted_extra_seat_price_cents: 0 }),
        ],
        members: 3,
      }),
    );
    expect((await service.getSeatUsage("company-1")).canAddSeat).toBe(false);
  });

  it("dentro do limite: zero extras e custo zero", async () => {
    const service = createBillingService(
      makeRepo({
        plans: [threeSeatPlan],
        subscriptions: [makeSubscription({ plan_id: "plan-3seats" })],
        members: 2,
        pendingInvites: 1,
      }),
    );
    const usage = await service.getSeatUsage("company-1");
    expect(usage.extraSeats).toBe(0);
    expect(usage.extraCostCents).toBe(0);
  });

  it("plano sem max_members numérico = ilimitado, nunca gera extra", async () => {
    const unlimited = makePlan({ id: "plan-unl", code: "enterprise", features: {} });
    const service = createBillingService(
      makeRepo({
        plans: [unlimited],
        subscriptions: [makeSubscription({ plan_id: "plan-unl" })],
        members: 50,
      }),
    );
    const usage = await service.getSeatUsage("company-1");
    expect(usage.included).toBeNull();
    expect(usage.extraSeats).toBe(0);
  });

  it("sincroniza a quantidade de extras no gateway quando há assinatura ativa", async () => {
    const { gateway, calls } = makeGatewaySpy();
    const service = createBillingService(
      makeRepo({
        plans: [threeSeatPlan],
        subscriptions: [
          makeSubscription({ plan_id: "plan-3seats", external_subscription_id: "ext-sub" }),
        ],
        members: 5,
      }),
    );
    const usage = await service.syncSeatsWithGateway("company-1", gateway, "price_seat");
    expect(usage.extraSeats).toBe(2);
    expect(calls).toEqual([
      {
        externalSubscriptionId: "ext-sub",
        quantity: 2,
        unitPriceCents: 1990,
        basePriceCents: 9900,
        externalPriceId: "price_seat",
      },
    ]);
  });

  it("não altera cobrança no gateway durante o período pago de uma assinatura cancelada", async () => {
    const { gateway, calls } = makeGatewaySpy();
    await createBillingService(
      makeRepo({
        plans: [threeSeatPlan],
        subscriptions: [
          makeSubscription({
            plan_id: "plan-3seats",
            status: "canceled",
            current_period_end: new Date(Date.now() + 86_400_000).toISOString(),
          }),
        ],
        members: 5,
      }),
    ).syncSeatsWithGateway("company-1", gateway, "price_seat");
    expect(calls).toEqual([]);
  });

  it("não chama o gateway sem assinatura ativa (plano free) nem com assinatura cancelada", async () => {
    const { gateway, calls } = makeGatewaySpy();
    const freeState = { plans: [threeSeatPlan], subscriptions: [] as Subscription[], members: 5 };
    await createBillingService(makeRepo(freeState)).syncSeatsWithGateway(
      "company-1",
      gateway,
      "price_seat",
    );

    const canceledState = {
      plans: [threeSeatPlan],
      subscriptions: [makeSubscription({ plan_id: "plan-3seats", status: "canceled" as const })],
      members: 5,
    };
    await createBillingService(makeRepo(canceledState)).syncSeatsWithGateway(
      "company-1",
      gateway,
      "price_seat",
    );

    expect(calls).toHaveLength(0);
  });
});

describe("applyPaymentEvent", () => {
  function makeEvent(overrides: Partial<NormalizedPaymentEvent>): NormalizedPaymentEvent {
    return {
      type: "subscription.activated",
      gateway: "fake",
      externalSubscriptionId: "ext-new",
      externalCustomerId: "cus-new",
      companyId: "company-1",
      planId: "plan-pro",
      currentPeriodStart: "2026-07-01T00:00:00.000Z",
      currentPeriodEnd: "2026-08-01T00:00:00.000Z",
      cancelAtPeriodEnd: false,
      ...overrides,
    };
  }

  it("cria assinatura em subscription.activated quando não existe", async () => {
    const state = { plans: [] as Plan[], subscriptions: [] as Subscription[] };
    const service = createBillingService(makeRepo(state));
    await service.applyPaymentEvent(makeEvent({}));
    expect(state.subscriptions).toHaveLength(1);
    expect(state.subscriptions[0]).toMatchObject({
      company_id: "company-1",
      plan_id: "plan-pro",
      status: "active",
      external_subscription_id: "ext-new",
    });
  });

  it("é idempotente: evento repetido não duplica assinatura", async () => {
    const state = { plans: [] as Plan[], subscriptions: [] as Subscription[] };
    const service = createBillingService(makeRepo(state));
    await service.applyPaymentEvent(makeEvent({}));
    await service.applyPaymentEvent(makeEvent({}));
    expect(state.subscriptions).toHaveLength(1);
  });

  describe("compra parcelada, sem renovação", () => {
    const end = "2027-10-31T00:00:00.000Z";
    const activation = {
      type: "subscription.activated" as const,
      externalSubscriptionId: "ins_1",
      companyId: "company-1",
      planId: "plan-1",
      currentPeriodStart: "2026-10-31T00:00:00.000Z",
      currentPeriodEnd: end,
      nonRenewing: true,
      installmentPayment: true,
    };

    it("vale até o fim do período, mesmo com a situação ativa", () => {
      const subscription = makeSubscription({ renews: false, current_period_end: end });
      expect(hasPlanAccess(subscription, new Date("2027-10-30T00:00:00Z"))).toBe(true);
      expect(hasPlanAccess(subscription, new Date("2027-11-01T00:00:00Z"))).toBe(false);
      expect(hasPlanAccess(makeSubscription({ renews: false, current_period_end: null }))).toBe(false);
    });

    it("a primeira parcela cria a assinatura; as outras não mudam o período", async () => {
      const state = { plans: [makePlan({})], subscriptions: [] as Subscription[] };
      const service = createBillingService(makeRepo(state));
      await service.applyPaymentEvent(makeEvent(activation));
      expect(state.subscriptions[0]).toMatchObject({ renews: false, current_period_end: end, external_subscription_id: "ins_1" });
      await service.applyPaymentEvent(makeEvent({ ...activation, currentPeriodEnd: "2028-01-01T00:00:00.000Z" }));
      expect(state.subscriptions).toHaveLength(1);
      expect(state.subscriptions[0].current_period_end).toBe(end);
    });

    it("parcela paga depois do atraso reativa, mas não reabre o que foi estornado", async () => {
      const late = { plans: [makePlan({})], subscriptions: [makeSubscription({ renews: false, status: "past_due", external_subscription_id: "ins_1" })] };
      await createBillingService(makeRepo(late)).applyPaymentEvent(makeEvent(activation));
      expect(late.subscriptions[0].status).toBe("active");
      const refunded = { plans: [makePlan({})], subscriptions: [makeSubscription({ renews: false, status: "canceled", external_subscription_id: "ins_1" })] };
      await createBillingService(makeRepo(refunded)).applyPaymentEvent(makeEvent(activation));
      expect(refunded.subscriptions[0].status).toBe("canceled");
    });

    it("estorno integral encerra sem chamar o gateway; parcial não muda", async () => {
      const state = { plans: [makePlan({})], subscriptions: [makeSubscription({ renews: false, current_period_end: end, external_subscription_id: "ins_1" })] };
      const canceled: string[] = [];
      const gateway = { cancelSubscription: async (id: string) => void canceled.push(id) };
      const service = createBillingService(makeRepo(state));
      const refund = (refundedCents: number | null) =>
        makeEvent({ type: "payment.refunded", externalSubscriptionId: "ins_1", currentPeriodStart: null, refund: { externalPaymentId: "pay", refundedCents } });
      await service.applyPaymentEvent(refund(100), gateway);
      expect(state.subscriptions[0].status).toBe("active");
      await service.applyPaymentEvent(refund(null), gateway);
      expect(state.subscriptions[0].status).toBe("canceled");
      expect(canceled).toEqual([]);
      expect(hasPlanAccess(state.subscriptions[0], new Date(Date.now() + 1000))).toBe(false);
    });

    it("não tenta alterar valor no gateway", async () => {
      const calls: unknown[] = [];
      const gateway = { syncExtraSeats: async (update: unknown) => void calls.push(update) } as unknown as Parameters<ReturnType<typeof createBillingService>["syncSeatsWithGateway"]>[1];
      await createBillingService(
        makeRepo({ plans: [makePlan({})], subscriptions: [makeSubscription({ renews: false, current_period_end: end })], members: 5 }),
      ).syncSeatsWithGateway("company-1", gateway, null);
      expect(calls).toEqual([]);
    });
  });

  describe("estorno", () => {
    const periodStart = "2026-10-01T00:00:00.000Z";
    function setup(overrides: Partial<Subscription> = {}) {
      const state = {
        plans: [makePlan({})],
        subscriptions: [
          makeSubscription({
            current_period_start: periodStart,
            current_period_end: "2026-11-01T00:00:00.000Z",
            ...overrides,
          }),
        ],
      };
      const canceled: string[] = [];
      const gateway = {
        async cancelSubscription(id: string) {
          canceled.push(id);
        },
      };
      return { state, canceled, gateway, service: createBillingService(makeRepo(state)) };
    }
    const refund = (refundedCents: number | null, start: string | null = periodStart) =>
      makeEvent({
        type: "payment.refunded",
        externalSubscriptionId: "ext-1",
        currentPeriodStart: start,
        refund: { externalPaymentId: "pay-1", refundedCents },
      });

    it("integral do período atual encerra na hora e para as cobranças no gateway", async () => {
      const { state, canceled, gateway, service } = setup();
      const result = await service.applyPaymentEvent(refund(null), gateway);
      expect(canceled).toEqual(["ext-1"]);
      expect(state.subscriptions[0].status).toBe("canceled");
      expect(hasPlanAccess(state.subscriptions[0], new Date(Date.now() + 1000))).toBe(false);
      expect(result.endedSubscription?.id).toBe("sub-1");
    });

    it("parcial não muda a assinatura", async () => {
      const { state, canceled, gateway, service } = setup();
      expect(await service.applyPaymentEvent(refund(1000), gateway)).toEqual({});
      expect(canceled).toEqual([]);
      expect(state.subscriptions[0].status).toBe("active");
    });

    it("de cobrança antiga não derruba quem está em dia", async () => {
      const { state, canceled, gateway, service } = setup();
      await service.applyPaymentEvent(refund(null, "2026-08-01T00:00:00.000Z"), gateway);
      expect(canceled).toEqual([]);
      expect(state.subscriptions[0].status).toBe("active");
    });

    it("sem período conhecido não muda a assinatura", async () => {
      const { state, gateway, service } = setup();
      await service.applyPaymentEvent(refund(null, null), gateway);
      expect(state.subscriptions[0].status).toBe("active");
    });

    it("assinatura já cancelada perde o período restante, sem chamar o gateway de novo", async () => {
      const { state, canceled, gateway, service } = setup({ status: "canceled" });
      await service.applyPaymentEvent(refund(null), gateway);
      expect(canceled).toEqual([]);
      expect(hasPlanAccess(state.subscriptions[0], new Date(Date.now() + 1000))).toBe(false);
    });

    it("falha no gateway não grava o encerramento, para o webhook tentar de novo", async () => {
      const { state, service } = setup();
      await expect(
        service.applyPaymentEvent(refund(null), {
          async cancelSubscription() {
            throw new Error("gateway fora do ar");
          },
        }),
      ).rejects.toThrow("gateway fora do ar");
      expect(state.subscriptions[0].status).toBe("active");
    });
  });

  it("marca canceled em subscription.canceled", async () => {
    const state = {
      plans: [] as Plan[],
      subscriptions: [makeSubscription({ external_subscription_id: "ext-1" })],
    };
    const service = createBillingService(makeRepo(state));
    await service.applyPaymentEvent(
      makeEvent({ type: "subscription.canceled", externalSubscriptionId: "ext-1" }),
    );
    expect(state.subscriptions[0].status).toBe("canceled");
  });

  it("marca past_due em payment.failed", async () => {
    const state = {
      plans: [] as Plan[],
      subscriptions: [makeSubscription({ external_subscription_id: "ext-1" })],
    };
    const service = createBillingService(makeRepo(state));
    await service.applyPaymentEvent(
      makeEvent({ type: "payment.failed", externalSubscriptionId: "ext-1" }),
    );
    expect(state.subscriptions[0].status).toBe("past_due");
  });

  it("ignora ativação sem company_id/plan_id e eventos 'ignored' (não trava a fila do gateway)", async () => {
    const state = { plans: [] as Plan[], subscriptions: [] as Subscription[] };
    const service = createBillingService(makeRepo(state));
    // Não pode lançar: um erro aqui travaria a fila sequencial do Asaas.
    await service.applyPaymentEvent(makeEvent({ companyId: null }));
    await service.applyPaymentEvent(makeEvent({ type: "ignored" }));
    expect(state.subscriptions).toHaveLength(0);
  });
});

describe("teste grátis", () => {
  const NOW = new Date("2026-11-05T12:00:00Z");
  const plans = () => [makePlan({ id: "plan-pro", code: "pro" })];

  it("sem assinatura, a empresa não tem acesso e ainda pode testar", async () => {
    const billing = createBillingService(makeRepo({ plans: plans(), subscriptions: [] }));
    expect(await billing.getAccessState("company-1", NOW)).toEqual({ hasAccess: false, inCardlessTrial: false, trialEndsAt: null, trialAvailable: true });
  });

  it("teste sem cartão: 7 dias do plano completo, sem gateway e sem renovar", async () => {
    const state = { plans: plans(), subscriptions: [] as Subscription[] };
    const billing = createBillingService(makeRepo(state));
    const trial = await billing.startCardlessTrial("company-1", NOW);
    expect(trial).toMatchObject({
      plan_id: "plan-pro",
      status: "trialing",
      renews: false,
      external_subscription_id: null,
      current_period_end: "2026-11-12T12:00:00.000Z",
    });
    expect(isCardlessTrial(trial)).toBe(true);
    expect(await billing.getAccessState("company-1", NOW)).toMatchObject({ hasAccess: true, inCardlessTrial: true, trialEndsAt: "2026-11-12T12:00:00.000Z", trialAvailable: false });
    // Depois do sétimo dia, perde o acesso e não ganha outro teste.
    expect(await billing.getAccessState("company-1", new Date("2026-11-12T12:00:01Z"))).toMatchObject({ hasAccess: false, trialAvailable: false });
    await expect(billing.startCardlessTrial("company-1", NOW)).rejects.toMatchObject({ code: "conflict" });
  });

  it("quem já assinou, mesmo apagado no histórico, não ganha teste", async () => {
    const old = makeSubscription({ status: "canceled", deleted_at: "2026-01-01T00:00:00Z" });
    const billing = createBillingService(makeRepo({ plans: plans(), subscriptions: [old] }));
    await expect(billing.startCardlessTrial("company-1", NOW)).rejects.toMatchObject({ code: "conflict" });
  });

  it("teste com cartão entra como em teste e renova sozinho", async () => {
    const state = { plans: [makePlan({ id: "plan-1" })], subscriptions: [] as Subscription[] };
    const billing = createBillingService(makeRepo(state));
    await billing.applyPaymentEvent({
      type: "subscription.activated",
      gateway: "fake",
      externalSubscriptionId: "ext-trial",
      externalCustomerId: "cus",
      companyId: "company-1",
      planId: "plan-1",
      currentPeriodStart: NOW.toISOString(),
      currentPeriodEnd: "2026-11-12T12:00:00.000Z",
      cancelAtPeriodEnd: false,
      trialEndsAt: "2026-11-12T12:00:00.000Z",
    });
    expect(state.subscriptions[0]).toMatchObject({ status: "trialing", renews: true });
    expect(isCardlessTrial(state.subscriptions[0])).toBe(false);
  });
});

describe("ciclo do plano anual em parcelas (simulação)", () => {
  const COMPANY = "company-1";
  const annualPlan = makePlan({ id: "plan-annual", code: "anual_teste", billing_interval: "year", term_payments: 3, price_cents: 1500 });

  /** Gateway de mentira que só guarda as renovações pedidas e devolve um id de termo novo a cada uma. */
  function makeRenewalGateway(options: { failWith?: Error; cancelFailsWith?: Error } = {}) {
    const renewals: Array<{ externalReference: string; maxPayments: number | null; nextDueDate: string; paymentMethodToken: string }> = [];
    const canceled: string[] = [];
    return {
      renewals,
      canceled,
      gateway: {
        async cancelSubscription(externalSubscriptionId: string) {
          if (options.cancelFailsWith) throw options.cancelFailsWith;
          canceled.push(externalSubscriptionId);
        },
        async renewSubscription(params: (typeof renewals)[number]) {
          if (options.failWith) throw options.failWith;
          renewals.push(params);
          return { externalSubscriptionId: `ext-termo-${renewals.length + 1}`, currentPeriodEnd: "2027-03-17T00:00:00.000Z" };
        },
      },
    };
  }

  /** Cada parcela paga chega como um evento do termo; a última traz termRenewal, como o adapter monta. */
  function parcel(termId: string, number: number, termPayments: number, overrides: Partial<NormalizedPaymentEvent> = {}): NormalizedPaymentEvent {
    return {
      type: "subscription.activated",
      gateway: "asaas",
      externalSubscriptionId: termId,
      externalCustomerId: "cus-1",
      companyId: COMPANY,
      planId: annualPlan.id,
      currentPeriodStart: `2026-1${number}-01T00:00:00.000Z`,
      currentPeriodEnd: "2027-01-01T00:00:00.000Z",
      cancelAtPeriodEnd: false,
      payment: { externalId: `${termId}-pay-${number}`, grossAmountCents: 500 },
      termRenewal:
        number === termPayments
          ? { externalCustomerId: "cus-1", paymentMethodToken: "tok-cartao", valueCents: 500, maxPayments: termPayments, nextDueDate: "2027-01-10" }
          : undefined,
      ...overrides,
    };
  }

  function setup() {
    const state = { plans: [annualPlan], subscriptions: [makeSubscription({ id: "sub-1", plan_id: annualPlan.id, external_subscription_id: "ext-termo-1", status: "active", contracted_price_cents: 1500 })] };
    return { state, service: createBillingService(makeRepo(state)), ...makeRenewalGateway() };
  }

  async function run(service: ReturnType<typeof createBillingService>, gateway: Parameters<ReturnType<typeof createBillingService>["renewTerm"]>[1], event: NormalizedPaymentEvent) {
    await service.applyPaymentEvent(event);
    return service.renewTerm(event, gateway);
  }

  it("renova só na última parcela do termo, e não antes", async () => {
    const { service, gateway, renewals, state } = setup();
    expect(await run(service, gateway, parcel("ext-termo-1", 1, 3))).toBe(false);
    expect(await run(service, gateway, parcel("ext-termo-1", 2, 3))).toBe(false);
    expect(renewals).toHaveLength(0);
    expect(state.subscriptions[0].external_subscription_id).toBe("ext-termo-1");
    expect(await run(service, gateway, parcel("ext-termo-1", 3, 3))).toBe(true);
    expect(renewals).toHaveLength(1);
  });

  it("a renovação usa o cartão guardado, o valor da parcela e liga o termo novo à empresa e ao plano", async () => {
    const { service, gateway, renewals } = setup();
    await run(service, gateway, parcel("ext-termo-1", 3, 3));
    expect(renewals[0]).toMatchObject({ paymentMethodToken: "tok-cartao", maxPayments: 3, nextDueDate: "2027-01-10", externalReference: `${COMPANY}:${annualPlan.id}` });
  });

  it("a assinatura passa a apontar para o termo novo, continua ativa e renovável, e o período se estende", async () => {
    const { service, gateway, state } = setup();
    await run(service, gateway, parcel("ext-termo-1", 3, 3));
    expect(state.subscriptions).toHaveLength(1);
    expect(state.subscriptions[0]).toMatchObject({ external_subscription_id: "ext-termo-2", status: "active", renews: true, current_period_end: "2027-03-17T00:00:00.000Z" });
  });

  it("evento de termo já encerrado não muda nada e não conta como cancelamento: nem o aviso de que o termo antigo foi removido", async () => {
    const { service, gateway, state } = setup();
    await run(service, gateway, parcel("ext-termo-1", 3, 3));
    const before = JSON.stringify(state.subscriptions);
    for (const type of ["subscription.activated", "subscription.updated", "subscription.canceled", "payment.failed"] as const) {
      const result = await service.applyPaymentEvent({ ...parcel("ext-termo-1", 3, 3), type, termRenewal: undefined });
      expect(result, type).toEqual({ ignored: true });
    }
    expect(JSON.stringify(state.subscriptions)).toBe(before);
    expect(state.subscriptions[0].status).toBe("active");
  });

  it("evento repetido da última parcela do termo velho (ex.: RECEIVED depois do CONFIRMED) não renova de novo", async () => {
    const { service, gateway, renewals } = setup();
    const last = parcel("ext-termo-1", 3, 3);
    expect(await run(service, gateway, last)).toBe(true);
    expect(await run(service, gateway, last)).toBe(false);
    expect(await run(service, gateway, { ...last, payment: { externalId: "ext-termo-1-pay-3", grossAmountCents: 500 } })).toBe(false);
    expect(renewals).toHaveLength(1);
  });

  it("o segundo ciclo corre igual: 3 parcelas do termo novo e outra renovação, sempre uma só por ciclo", async () => {
    const { service, gateway, renewals, state } = setup();
    for (const n of [1, 2, 3]) await run(service, gateway, parcel("ext-termo-1", n, 3));
    for (const n of [1, 2]) expect(await run(service, gateway, parcel("ext-termo-2", n, 3))).toBe(false);
    expect(await run(service, gateway, parcel("ext-termo-2", 3, 3))).toBe(true);
    expect(renewals).toHaveLength(2);
    expect(state.subscriptions[0].external_subscription_id).toBe("ext-termo-3");
    // O termo velho (o primeiro) não mexe mais na assinatura.
    expect(await run(service, gateway, parcel("ext-termo-1", 3, 3))).toBe(false);
    expect(renewals).toHaveLength(2);
  });

  it("parcela atrasada marca em atraso, e o pagamento seguinte reativa sem renovar antes da hora", async () => {
    const { service, gateway, renewals, state } = setup();
    await run(service, gateway, parcel("ext-termo-1", 1, 3));
    await service.applyPaymentEvent({ ...parcel("ext-termo-1", 2, 3), type: "payment.failed", payment: undefined, termRenewal: undefined });
    expect(state.subscriptions[0].status).toBe("past_due");
    await run(service, gateway, parcel("ext-termo-1", 2, 3));
    expect(state.subscriptions[0].status).toBe("active");
    expect(renewals).toHaveLength(0);
  });

  it("se o gateway falha ao criar o termo novo, a assinatura fica como estava e o erro sobe para o webhook registrar", async () => {
    const state = { plans: [annualPlan], subscriptions: [makeSubscription({ id: "sub-1", plan_id: annualPlan.id, external_subscription_id: "ext-termo-1", status: "active" })] };
    const service = createBillingService(makeRepo(state));
    const { gateway } = makeRenewalGateway({ failWith: new Error("Asaas fora do ar") });
    await expect(run(service, gateway, parcel("ext-termo-1", 3, 3))).rejects.toThrow("Asaas fora do ar");
    expect(state.subscriptions[0]).toMatchObject({ external_subscription_id: "ext-termo-1", status: "active" });
  });

  it("evento sem termRenewal, ou de assinatura que não existe, nunca chama o gateway", async () => {
    const { service, gateway, renewals } = setup();
    expect(await service.renewTerm({ ...parcel("ext-termo-1", 1, 3) }, gateway)).toBe(false);
    expect(await service.renewTerm(parcel("ext-desconhecido", 3, 3), gateway)).toBe(false);
    expect(await service.renewTerm({ ...parcel("ext-termo-1", 3, 3), externalSubscriptionId: null }, gateway)).toBe(false);
    expect(renewals).toHaveLength(0);
  });

  it("plano de 1 parcela: a primeira cobrança paga já fecha o termo e renova na hora (o teste de renovação sem espera)", async () => {
    const { service, gateway, renewals, state } = setup();
    expect(await run(service, gateway, parcel("ext-termo-1", 1, 1))).toBe(true);
    expect(renewals).toHaveLength(1);
    expect(renewals[0]).toMatchObject({ maxPayments: 1, paymentMethodToken: "tok-cartao" });
    expect(state.subscriptions[0].external_subscription_id).toBe("ext-termo-2");
  });

  it("depois de renovar, encerra o termo antigo no gateway (uma vez só) para ele não gerar cobrança além do termo novo", async () => {
    const { service, gateway, canceled } = setup();
    await run(service, gateway, parcel("ext-termo-1", 3, 3));
    expect(canceled).toEqual(["ext-termo-1"]);
    // Evento repetido do termo velho não renova de novo e não manda encerrar outra vez.
    await run(service, gateway, parcel("ext-termo-1", 3, 3));
    expect(canceled).toEqual(["ext-termo-1"]);
  });

  it("se encerrar o termo antigo falhar, a renovação continua valendo e o erro só é registrado", async () => {
    const state = { plans: [annualPlan], subscriptions: [makeSubscription({ id: "sub-1", plan_id: annualPlan.id, external_subscription_id: "ext-termo-1", status: "active" })] };
    const service = createBillingService(makeRepo(state));
    const { gateway, renewals } = makeRenewalGateway({ cancelFailsWith: new Error("Asaas fora do ar") });
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(run(service, gateway, parcel("ext-termo-1", 3, 3))).resolves.toBe(true);
    expect(renewals).toHaveLength(1);
    expect(state.subscriptions[0].external_subscription_id).toBe("ext-termo-2");
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });

  it("se criar o termo novo falhar, o antigo NÃO é encerrado: o cliente não fica sem nenhum", async () => {
    const state = { plans: [annualPlan], subscriptions: [makeSubscription({ id: "sub-1", plan_id: annualPlan.id, external_subscription_id: "ext-termo-1", status: "active" })] };
    const service = createBillingService(makeRepo(state));
    const { gateway, canceled } = makeRenewalGateway({ failWith: new Error("Asaas fora do ar") });
    await expect(run(service, gateway, parcel("ext-termo-1", 3, 3))).rejects.toThrow();
    expect(canceled).toHaveLength(0);
  });
});

describe("troca de plano no fim do período", () => {
  const COMPANY = "company-1";
  const monthly = makePlan({ id: "plan-m", price_cents: 10000 });
  const better = makePlan({ id: "plan-max", code: "max", price_cents: 20000 });
  const quarterly = makePlan({ id: "plan-q", code: "tri", price_cents: 24000, billing_interval: "year", term_payments: 3 });
  const worse = makePlan({ id: "plan-low", code: "low", price_cents: 5000 });
  const periodEnd = new Date(Date.now() + 10 * 86400000).toISOString();

  function setup(subOverrides: Partial<Subscription> = {}, currentPlan: Plan = monthly) {
    const state = {
      plans: [currentPlan, better, quarterly, worse],
      subscriptions: [
        makeSubscription({
          plan_id: currentPlan.id,
          contracted_price_cents: currentPlan.price_cents,
          payment_method_token: "tok",
          current_period_end: periodEnd,
          ...subOverrides,
        }),
      ],
    };
    const calls: string[] = [];
    const renewals: Array<{ valueCents: number; maxPayments: number | null; nextDueDate: string; externalReference: string }> = [];
    const gateway = {
      async cancelSubscription(id: string) {
        calls.push(`cancel:${id}`);
      },
      async renewSubscription(params: { valueCents: number; maxPayments: number | null; nextDueDate: string; externalReference: string }) {
        renewals.push(params);
        calls.push("renew");
        return { externalSubscriptionId: "ext-novo", currentPeriodEnd: periodEnd };
      },
    };
    return { state, calls, renewals, gateway, service: createBillingService(makeRepo(state)) };
  }

  it("mensal: cria a assinatura nova com a 1ª cobrança no fim do período e encerra a antiga", async () => {
    const { service, gateway, state, renewals, calls } = setup();
    await service.scheduleSwitch(COMPANY, better, gateway);
    expect(renewals[0]).toMatchObject({ valueCents: 20000, maxPayments: null, nextDueDate: periodEnd.slice(0, 10), externalReference: `${COMPANY}:plan-m`.replace("plan-m", "plan-max") });
    expect(calls).toEqual(["renew", "cancel:ext-1"]);
    // Nada muda hoje: o plano segue o atual até a data.
    expect(state.subscriptions[0]).toMatchObject({ plan_id: "plan-m", scheduled_plan_id: "plan-max", scheduled_external_subscription_id: "ext-novo", status: "active" });
  });

  it("mensal para ciclo: a parcela é o total dividido e o termo tem as parcelas do plano", async () => {
    const { service, gateway, renewals } = setup();
    await service.scheduleSwitch(COMPANY, quarterly, gateway);
    expect(renewals[0]).toMatchObject({ valueCents: 8000, maxPayments: 3 });
  });

  it("recusa plano pior ou igual e troca já agendada", async () => {
    const { service, gateway } = setup();
    await expect(service.scheduleSwitch(COMPANY, worse, gateway)).rejects.toThrow();
    await expect(service.scheduleSwitch(COMPANY, monthly, gateway)).rejects.toThrow();
    await service.scheduleSwitch(COMPANY, better, gateway);
    await expect(service.scheduleSwitch(COMPANY, quarterly, gateway)).rejects.toThrow(/agendada/);
  });

  it("recusa sem cartão guardado ou sem renovação automática", async () => {
    await expect(setup({ payment_method_token: null }).service.scheduleSwitch(COMPANY, better, setup().gateway)).rejects.toThrow();
    await expect(setup({ renews: false }).service.scheduleSwitch(COMPANY, better, setup().gateway)).rejects.toThrow();
  });

  it("se encerrar a antiga falha, desfaz a nova e não agenda", async () => {
    const { service, state, calls } = setup();
    const gateway = {
      async cancelSubscription(id: string) {
        calls.push(`cancel:${id}`);
        if (id === "ext-1") throw new Error("fora do ar");
      },
      async renewSubscription() {
        calls.push("renew");
        return { externalSubscriptionId: "ext-novo", currentPeriodEnd: periodEnd };
      },
    };
    await expect(service.scheduleSwitch(COMPANY, better, gateway)).rejects.toThrow();
    expect(calls).toEqual(["renew", "cancel:ext-1", "cancel:ext-novo"]);
    expect(state.subscriptions[0].scheduled_plan_id).toBeNull();
  });

  it("o cancelamento da assinatura antiga não cancela a assinatura da empresa", async () => {
    const { service, gateway, state } = setup();
    await service.scheduleSwitch(COMPANY, better, gateway);
    const result = await service.applyPaymentEvent({ type: "subscription.canceled", gateway: "asaas", externalSubscriptionId: "ext-1", externalCustomerId: "cus-1", companyId: COMPANY, planId: "plan-m", currentPeriodStart: null, currentPeriodEnd: null, cancelAtPeriodEnd: false });
    expect(result.ignored).toBe(true);
    expect(state.subscriptions[0].status).toBe("active");
  });

  it("a 1ª cobrança do plano novo vira a assinatura nova, herdando cartão e termos encerrados", async () => {
    const { service, gateway, state } = setup();
    await service.scheduleSwitch(COMPANY, better, gateway);
    await service.applyPaymentEvent({ type: "subscription.activated", gateway: "asaas", externalSubscriptionId: "ext-novo", externalCustomerId: "cus-1", companyId: COMPANY, planId: "plan-max", currentPeriodStart: periodEnd, currentPeriodEnd: periodEnd, cancelAtPeriodEnd: false });
    const active = state.subscriptions.find((s) => !s.deleted_at)!;
    expect(active).toMatchObject({ plan_id: "plan-max", external_subscription_id: "ext-novo", payment_method_token: "tok", scheduled_plan_id: null });
    expect(active.ended_external_ids).toContain("ext-1");
  });

  it("ciclo: a troca entra na renovação do termo, com valor e parcelas do plano novo", async () => {
    const annual = makePlan({ id: "plan-y", code: "ano", price_cents: 12000, billing_interval: "year", term_payments: 12 });
    const { service, state } = setup({ external_subscription_id: "ext-termo" }, annual);
    state.plans.push(better);
    const calls: Array<{ valueCents: number; maxPayments: number | null; externalReference: string }> = [];
    const gateway = {
      async cancelSubscription() {},
      async renewSubscription(params: { valueCents: number; maxPayments: number | null; externalReference: string }) {
        calls.push(params);
        return { externalSubscriptionId: "ext-termo-2", currentPeriodEnd: periodEnd };
      },
    };
    await service.scheduleSwitch(COMPANY, better, gateway);
    expect(calls).toHaveLength(0); // parcelas restantes continuam: nada criado agora
    await service.renewTerm(
      { type: "subscription.activated", gateway: "asaas", externalSubscriptionId: "ext-termo", externalCustomerId: "cus-1", companyId: COMPANY, planId: "plan-y", currentPeriodStart: null, currentPeriodEnd: null, cancelAtPeriodEnd: false, termRenewal: { externalCustomerId: "cus-1", paymentMethodToken: "tok", valueCents: 1000, maxPayments: 12, nextDueDate: "2027-12-01" } },
      gateway,
    );
    expect(calls[0]).toMatchObject({ valueCents: 20000, maxPayments: null, externalReference: `${COMPANY}:plan-max` });
    expect(state.subscriptions[0]).toMatchObject({ plan_id: "plan-max", scheduled_plan_id: null, external_subscription_id: "ext-termo-2" });
  });
});

describe("plano piloto (preço 0, privado, sem prazo)", () => {
  const PILOT_PLAN = makePlan({ id: "pilot", code: "piloto", name: "Piloto", price_cents: 0, is_public: false });
  const pilotSubscription = (overrides: Partial<Subscription> = {}) =>
    makeSubscription({ plan_id: "pilot", external_subscription_id: null, external_customer_id: null, gateway_provider: null, contracted_price_cents: 0, current_period_end: null, ...overrides });

  it("assinatura ativa, sem gateway e sem fim é piloto, e dá acesso para sempre", () => {
    const pilot = pilotSubscription();
    expect(isPilotSubscription(pilot)).toBe(true);
    expect(hasPlanAccess(pilot, new Date("2099-01-01T00:00:00Z"))).toBe(true);
  });

  it("assinatura paga ou com prazo não é piloto", () => {
    expect(isPilotSubscription(null)).toBe(false);
    expect(isPilotSubscription(makeSubscription({}))).toBe(false);
    expect(isPilotSubscription(pilotSubscription({ current_period_end: "2026-12-01T00:00:00Z" }))).toBe(false);
    expect(isPilotSubscription(pilotSubscription({ renews: false }))).toBe(false);
    expect(isPilotSubscription(pilotSubscription({ status: "trialing" }))).toBe(false);
  });

  it("depois de encerrada, a empresa fica sem acesso e cai na tela de assinar", async () => {
    const state = { plans: [PILOT_PLAN, makePlan({ id: "free", code: DEFAULT_PLAN_CODE, price_cents: 0 })], subscriptions: [pilotSubscription()] };
    const service = createBillingService(makeRepo(state));
    expect((await service.getAccessState("company-1")).hasAccess).toBe(true);

    await service.endPilot("company-1", "admin-1");

    const after = await service.getAccessState("company-1");
    expect(after.hasAccess).toBe(false);
    expect(await service.getEffectivePlan("company-1")).toMatchObject({ code: DEFAULT_PLAN_CODE });
  });

  it("só ativa plano privado, de preço 0, mensal, ativo e que não seja o padrão", async () => {
    const state = { plans: [PILOT_PLAN], subscriptions: [] as Subscription[] };
    const service = createBillingService(makeRepo(state));

    const subscription = await service.activatePilot("company-1", PILOT_PLAN, "user-1");
    expect(isPilotSubscription(subscription)).toBe(true);
    expect(subscription.contracted_price_cents).toBe(0);

    for (const plan of [
      null,
      makePlan({ price_cents: 9900, is_public: false }),
      makePlan({ price_cents: 0, is_public: true, code: "gratis" }),
      makePlan({ price_cents: 0, is_public: false, code: "free" }),
      makePlan({ price_cents: 0, is_public: false, code: "piloto", is_active: false }),
      makePlan({ price_cents: 0, is_public: false, code: "piloto", billing_interval: "year" }),
    ]) {
      await expect(service.activatePilot("company-1", plan, "user-1")).rejects.toMatchObject({ code: "not_found" });
    }
    expect(state.subscriptions).toHaveLength(1);
  });
});
