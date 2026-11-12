import { describe, expect, it, vi } from "vitest";
import type { CreateCheckoutParams } from "@/types/billing";
import { createAsaasGateway, parseExternalReference } from "./asaasGateway";

const TOKEN = "token-do-webhook";

type Route = (url: string, init: RequestInit) => unknown;

/** fetch fake: responde por método + caminho e registra as chamadas. */
function makeFetch(routes: Record<string, Route>) {
  const calls: Array<{ method: string; path: string; body: unknown }> = [];
  const fetchFn = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const path = url.replace(/^https:\/\/[^/]+\/v3/, "");
    const method = init?.method ?? "GET";
    calls.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const route = routes[`${method} ${path}`];
    if (!route) {
      return new Response(JSON.stringify({ errors: [{ description: "rota fake" }] }), {
        status: 404,
      });
    }
    return new Response(JSON.stringify(route(url, init ?? {})), { status: 200 });
  });
  return { fetchFn: fetchFn as unknown as typeof fetch, calls };
}

function makeGateway(routes: Record<string, Route> = {}) {
  const { fetchFn, calls } = makeFetch(routes);
  const gateway = createAsaasGateway({
    apiKey: "$aact_test",
    webhookToken: TOKEN,
    environment: "sandbox",
    fetchFn,
  });
  return { gateway, calls };
}

function webhook(body: unknown, token = TOKEN) {
  return {
    payload: JSON.stringify(body),
    headers: new Headers(token ? { "asaas-access-token": token } : {}),
  };
}

const checkoutParams: CreateCheckoutParams = {
  companyId: "company-1",
  plan: {
    id: "plan-pro",
    code: "pro",
    name: "Pro",
    priceCents: 9900,
    currency: "BRL",
    billingInterval: "month",
    externalPriceId: null,
    paymentMethods: ["credit_card"],
  },
  customer: { email: "ana@example.com", name: "Ana" },
  successUrl: "https://app.example.com/dashboard/billing?status=success",
  cancelUrl: "https://app.example.com/dashboard/billing?status=canceled",
};

describe("parseExternalReference", () => {
  it("separa empresa e plano", () => {
    expect(parseExternalReference("c1:p1")).toEqual({ companyId: "c1", planId: "p1" });
  });

  it("formato inválido vira null", () => {
    expect(parseExternalReference("só-um-valor")).toBeNull();
    expect(parseExternalReference(null)).toBeNull();
  });
});

describe("createCheckout", () => {
  it("mensal cria checkout hospedado recorrente com o valor e a referência da empresa", async () => {
    const { gateway, calls } = makeGateway({
      "POST /checkouts": () => ({ id: "chk-1", link: "https://asaas.com/checkout/chk-1" }),
    });

    await expect(gateway.createCheckout(checkoutParams)).resolves.toEqual({
      id: "chk-1",
      url: "https://asaas.com/checkout/chk-1",
    });
    expect(calls[0].path).toBe("/checkouts");
    expect(calls[0].body).toMatchObject({
      chargeTypes: ["RECURRENT"],
      externalReference: "company-1:plan-pro",
      subscription: { cycle: "MONTHLY" },
      items: [{ value: 99, quantity: 1 }],
      callback: { successUrl: checkoutParams.successUrl, cancelUrl: checkoutParams.cancelUrl },
    });
  });

  it("sem teste, a 1ª cobrança (nextDueDate) é hoje", async () => {
    const { gateway, calls } = makeGateway({ "POST /checkouts": () => ({ id: "c", link: "u" }) });
    await gateway.createCheckout(checkoutParams);
    const today = new Date();
    const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    expect((calls[0].body as { subscription: { nextDueDate: string } }).subscription.nextDueDate).toBe(iso);
  });

  it("com teste, a 1ª cobrança é adiada em trialDays e o meio é só cartão", async () => {
    const { gateway, calls } = makeGateway({ "POST /checkouts": () => ({ id: "c", link: "u" }) });
    await gateway.createCheckout({ ...checkoutParams, trialDays: 15 });
    const body = calls[0].body as { subscription: { nextDueDate: string }; billingTypes: string[] };
    const due = new Date(`${body.subscription.nextDueDate}T00:00:00`);
    const days = Math.round((due.getTime() - new Date(new Date().toDateString()).getTime()) / 86_400_000);
    expect(days).toBe(15);
    // Teste exige cartão: PIX/boleto não guardam o meio para a cobrança futura.
    expect(body.billingTypes).toEqual(["CREDIT_CARD"]);
  });

  it("sem teste, os meios do plano definem os billingTypes do checkout", async () => {
    const run = async (paymentMethods: string[]) => {
      const { gateway, calls } = makeGateway({ "POST /checkouts": () => ({ id: "c", link: "u" }) });
      await gateway.createCheckout({ ...checkoutParams, plan: { ...checkoutParams.plan, paymentMethods } });
      return (calls[0].body as { billingTypes: string[] }).billingTypes;
    };
    expect(await run(["credit_card"])).toEqual(["CREDIT_CARD"]);
    expect(await run(["pix"])).toEqual(["PIX"]);
    expect(await run(["credit_card", "pix"])).toEqual(["CREDIT_CARD", "PIX"]);
    // Boleto não entra em assinatura; sem meio válido, cai no cartão.
    expect(await run(["boleto"])).toEqual(["CREDIT_CARD"]);
  });

  it("plano anual vira assinatura mensal 12x (termo), valor por mês e só cartão", async () => {
    const { gateway, calls } = makeGateway({ "POST /checkouts": () => ({ id: "c", link: "u" }) });
    await gateway.createCheckout({
      // priceCents anual = 395880 (R$3.958,80/ano) -> R$329,90/mês.
      ...checkoutParams,
      plan: { ...checkoutParams.plan, billingInterval: "year", priceCents: 395880, paymentMethods: ["credit_card", "pix"] },
    });
    expect(calls[0].path).toBe("/checkouts");
    const body = calls[0].body as { billingTypes: string[]; subscription: { cycle: string; maxPayments: number }; items: Array<{ value: number }> };
    expect(body.billingTypes).toEqual(["CREDIT_CARD"]); // anual só no cartão (para tokenizar e renovar)
    expect(body.subscription).toMatchObject({ cycle: "MONTHLY", maxPayments: 12 });
    expect(body.items[0].value).toBe(329.9); // 395880 centavos / 12 = 32990 -> R$329,90
  });

  it("erro da API vira payment_error sem vazar o detalhe", async () => {
    const { gateway } = makeGateway();
    await expect(gateway.createCheckout(checkoutParams)).rejects.toMatchObject({
      code: "payment_error",
      message: "Falha na operação de pagamento",
    });
  });
});

describe("handleWebhook", () => {
  it("recusa token ausente ou errado", async () => {
    const { gateway } = makeGateway();
    await expect(gateway.handleWebhook(webhook({}, ""))).rejects.toMatchObject({
      code: "payment_error",
    });
    await expect(gateway.handleWebhook(webhook({}, "outro-token"))).rejects.toMatchObject({
      code: "payment_error",
    });
  });

  it("pagamento confirmado de assinatura ativa o plano com período e empresa", async () => {
    const { gateway } = makeGateway({
      "GET /subscriptions/sub_1": () => ({
        id: "sub_1",
        customer: "cus_1",
        externalReference: "company-1:plan-pro",
        nextDueDate: "2026-11-26",
      }),
    });
    const event = await gateway.handleWebhook(
      webhook({
        event: "PAYMENT_CONFIRMED",
        payment: { id: "pay_1", customer: "cus_1", subscription: "sub_1", dueDate: "2026-10-26" },
      }),
    );
    expect(event).toEqual({
      type: "subscription.activated",
      gateway: "asaas",
      externalSubscriptionId: "sub_1",
      externalCustomerId: "cus_1",
      companyId: "company-1",
      planId: "plan-pro",
      currentPeriodStart: "2026-10-26T00:00:00.000Z",
      currentPeriodEnd: "2026-11-26T00:00:00.000Z",
      cancelAtPeriodEnd: false,
    });
  });

  it("sem referência na assinatura, busca no link de pagamento de origem", async () => {
    const { gateway } = makeGateway({
      "GET /subscriptions/sub_1": () => ({ id: "sub_1", externalReference: null }),
      "GET /paymentLinks/link-1": () => ({ externalReference: "company-9:plan-ent" }),
    });
    const event = await gateway.handleWebhook(
      webhook({
        event: "PAYMENT_RECEIVED",
        payment: { subscription: "sub_1", paymentLink: "link-1", dueDate: "2026-10-26" },
      }),
    );
    expect(event).toMatchObject({ companyId: "company-9", planId: "plan-ent" });
  });

  it("pagamento vencido vira payment.failed", async () => {
    const { gateway } = makeGateway({
      "GET /subscriptions/sub_1": () => ({ id: "sub_1", externalReference: "c:p" }),
    });
    const event = await gateway.handleWebhook(
      webhook({ event: "PAYMENT_OVERDUE", payment: { subscription: "sub_1" } }),
    );
    expect(event.type).toBe("payment.failed");
  });

  it("assinatura removida vira subscription.canceled sem chamar a API", async () => {
    const { gateway, calls } = makeGateway();
    const event = await gateway.handleWebhook(
      webhook({ event: "SUBSCRIPTION_DELETED", subscription: { id: "sub_1", customer: "cus_1" } }),
    );
    expect(event).toMatchObject({ type: "subscription.canceled", externalSubscriptionId: "sub_1" });
    expect(calls).toHaveLength(0);
  });

  it("CHECKOUT_PAID com cobrança futura entra como teste (trialing), achando a sub pelo checkoutSession", async () => {
    const future = new Date(Date.now() + 15 * 86_400_000).toISOString().slice(0, 10);
    const { gateway } = makeGateway({
      // A API não filtra por checkoutSession: devolve a lista e o adapter casa pelo campo.
      "GET /subscriptions?limit=100&offset=0": () => ({
        data: [
          { id: "sub_outra", checkoutSession: "chk_zzz", customer: "cus_x" },
          { id: "sub_1", checkoutSession: "chk_1", customer: "cus_1", nextDueDate: "2099-02-01" },
        ],
      }),
    });
    const event = await gateway.handleWebhook(
      webhook({
        event: "CHECKOUT_PAID",
        checkout: { id: "chk_1", externalReference: "company-1:plan-pro", subscription: { nextDueDate: future } },
      }),
    );
    expect(event).toMatchObject({
      type: "subscription.activated",
      externalSubscriptionId: "sub_1",
      externalCustomerId: "cus_1",
      companyId: "company-1",
      planId: "plan-pro",
      trialEndsAt: `${future}T00:00:00.000Z`,
    });
    // Teste não gera comissão: nada foi pago ainda.
    expect(event.payment).toBeUndefined();
  });

  it("CHECKOUT_PAID aceita nextDueDate como timestamp completo (formato do checkout)", async () => {
    const { gateway } = makeGateway({
      "GET /subscriptions?limit=100&offset=0": () => ({ data: [{ id: "sub_ts", checkoutSession: "chk_ts" }] }),
    });
    const event = await gateway.handleWebhook(
      webhook({
        event: "CHECKOUT_PAID",
        checkout: { id: "chk_ts", externalReference: "company-1:plan-pro", subscription: { nextDueDate: "2099-11-26T03:00:00+0000" } },
      }),
    );
    expect(event).toMatchObject({ type: "subscription.activated", externalSubscriptionId: "sub_ts", trialEndsAt: "2099-11-26T03:00:00.000Z" });
  });

  it("CHECKOUT_PAID com cobrança hoje (sem teste) entra ativo, sem trialEndsAt", async () => {
    const { gateway } = makeGateway({
      "GET /subscriptions?limit=100&offset=0": () => ({ data: [{ id: "sub_2", checkoutSession: "chk_2", customer: "cus_2" }] }),
    });
    const event = await gateway.handleWebhook(
      webhook({
        event: "CHECKOUT_PAID",
        checkout: { id: "chk_2", externalReference: "company-1:plan-pro", subscription: { nextDueDate: "2000-01-01" } },
      }),
    );
    expect(event).toMatchObject({ type: "subscription.activated", externalSubscriptionId: "sub_2", trialEndsAt: null });
  });

  it("CHECKOUT_PAID sem referência ou sem assinatura correspondente é ignorado", async () => {
    const { gateway } = makeGateway({
      "GET /subscriptions?limit=100&offset=0": () => ({ data: [{ id: "sub_x", checkoutSession: "outro" }] }),
    });
    // Sem externalReference válido.
    await expect(
      gateway.handleWebhook(webhook({ event: "CHECKOUT_PAID", checkout: { id: "chk_9", externalReference: null } })),
    ).resolves.toMatchObject({ type: "ignored" });
    // Referência ok, mas nenhuma assinatura casa o checkoutSession.
    await expect(
      gateway.handleWebhook(webhook({ event: "CHECKOUT_PAID", checkout: { id: "chk_9", externalReference: "c:p" } })),
    ).resolves.toMatchObject({ type: "ignored" });
  });

  it("cobrança confirmada de sub do checkout (sem externalReference) ativa casando pelo id", async () => {
    const { gateway } = makeGateway({
      // Sub criada pelo checkout: externalReference nulo. O vínculo veio no CHECKOUT_PAID.
      "GET /subscriptions/sub_1": () => ({ id: "sub_1", externalReference: null, nextDueDate: "2099-02-01" }),
    });
    const event = await gateway.handleWebhook(
      webhook({ event: "PAYMENT_CONFIRMED", payment: { id: "pay_1", subscription: "sub_1", value: 99, dueDate: "2099-01-01" } }),
    );
    expect(event).toMatchObject({ type: "subscription.activated", externalSubscriptionId: "sub_1", companyId: null });
    // A comissão é registrada no pagamento real.
    expect(event.payment).toEqual({ externalId: "pay_1", grossAmountCents: 9900 });
  });

  it("última parcela do termo anual (12/12) pede renovação com o cartão tokenizado", async () => {
    const { gateway } = makeGateway({
      "GET /subscriptions/sub_a": () => ({
        id: "sub_a",
        customer: "cus_a",
        externalReference: null,
        nextDueDate: "2027-10-15",
        maxPayments: 12,
        value: 329.9,
        creditCard: { creditCardToken: "tok_123" },
      }),
      "GET /payments?subscription=sub_a&limit=100": () => ({ data: Array.from({ length: 12 }, () => ({ status: "CONFIRMED" })) }),
    });
    const event = await gateway.handleWebhook(
      webhook({ event: "PAYMENT_CONFIRMED", payment: { id: "pay_12", subscription: "sub_a", value: 329.9, dueDate: "2026-10-15" } }),
    );
    expect(event.termRenewal).toEqual({
      externalCustomerId: "cus_a",
      paymentMethodToken: "tok_123",
      valueCents: 32990,
      maxPayments: 12,
      nextDueDate: "2026-11-15", // mês seguinte à última cobrança
    });
  });

  it("parcela intermediária do termo (ex.: 5/12) não pede renovação", async () => {
    const { gateway } = makeGateway({
      "GET /subscriptions/sub_a": () => ({ id: "sub_a", customer: "cus_a", maxPayments: 12, value: 329.9, creditCard: { creditCardToken: "tok_123" } }),
      "GET /payments?subscription=sub_a&limit=100": () => ({ data: Array.from({ length: 5 }, () => ({ status: "CONFIRMED" })) }),
    });
    const event = await gateway.handleWebhook(
      webhook({ event: "PAYMENT_CONFIRMED", payment: { id: "pay_5", subscription: "sub_a", value: 329.9, dueDate: "2026-04-15" } }),
    );
    expect(event.termRenewal).toBeUndefined();
    expect(event.type).toBe("subscription.activated");
  });

  it("renewSubscription cria o próximo termo com o token (sem nova entrada de cartão)", async () => {
    const { gateway, calls } = makeGateway({ "POST /subscriptions": () => ({ id: "sub_novo" }) });
    const renewed = await gateway.renewSubscription({
      externalCustomerId: "cus_a",
      paymentMethodToken: "tok_123",
      valueCents: 32990,
      maxPayments: 12,
      nextDueDate: "2027-11-15",
      externalReference: "company-1:plan-anual",
    });
    expect(renewed.externalSubscriptionId).toBe("sub_novo");
    expect(calls[0].body).toMatchObject({
      customer: "cus_a",
      billingType: "CREDIT_CARD",
      value: 329.9,
      cycle: "MONTHLY",
      maxPayments: 12,
      nextDueDate: "2027-11-15",
      creditCardToken: "tok_123",
      externalReference: "company-1:plan-anual",
    });
  });

  it("pagamento avulso e eventos desconhecidos são ignorados", async () => {
    const { gateway } = makeGateway();
    await expect(
      gateway.handleWebhook(webhook({ event: "PAYMENT_CONFIRMED", payment: { id: "avulso" } })),
    ).resolves.toMatchObject({ type: "ignored" });
    await expect(
      gateway.handleWebhook(webhook({ event: "PAYMENT_CREATED", payment: {} })),
    ).resolves.toMatchObject({ type: "ignored" });
  });
});

describe("syncExtraSeats e cancelamento", () => {
  it("atualiza o valor total da assinatura (plano + extras)", async () => {
    const { gateway, calls } = makeGateway({ "PUT /subscriptions/sub_1": () => ({}) });
    await gateway.syncExtraSeats({
      externalSubscriptionId: "sub_1",
      quantity: 2,
      unitPriceCents: 1990,
      basePriceCents: 9900,
      externalPriceId: null,
    });
    expect(calls[0]).toEqual({
      method: "PUT",
      path: "/subscriptions/sub_1",
      body: { value: 138.8, updatePendingPayments: true },
    });
  });

  it("cancela removendo a assinatura no Asaas", async () => {
    const { gateway, calls } = makeGateway({ "DELETE /subscriptions/sub_1": () => ({}) });
    await gateway.cancelSubscription("sub_1");
    expect(calls[0]).toMatchObject({ method: "DELETE", path: "/subscriptions/sub_1" });
  });

  it("não tem portal do cliente", async () => {
    const { gateway } = makeGateway();
    await expect(gateway.getPortalUrl("cus_1", "https://x")).resolves.toBeNull();
  });
});

/** Estrutura e valores do exemplo de "Eventos para cobranças" na documentação do Asaas. */
function docsPaymentEvent(event: string, overrides: Record<string, unknown> = {}) {
  return {
    id: "evt_05b708f961d739ea7eba7e4db318f621&368604920",
    event,
    dateCreated: "2024-06-12 16:45:03",
    account: { id: "acc_1", ownerId: null },
    payment: {
      object: "payment",
      id: "pay_080225913252",
      dateCreated: "2021-01-01",
      customer: "cus_G7Dvo4iphUNk",
      subscription: "sub_VXJBYgP2u0eO",
      paymentLink: null,
      value: 100,
      netValue: 94.51,
      originalValue: null,
      billingType: "CREDIT_CARD",
      status: "RECEIVED",
      dueDate: "2021-01-01",
      externalReference: null,
      deleted: false,
      refunds: null,
      ...overrides,
    },
  };
}

const subscriptionRoute = {
  "GET /subscriptions/sub_VXJBYgP2u0eO": () => ({
    id: "sub_VXJBYgP2u0eO",
    customer: "cus_G7Dvo4iphUNk",
    externalReference: "company-1:plan-pro",
    nextDueDate: "2021-02-01",
  }),
};

describe("eventos de comissão (payloads da documentação)", () => {
  it.each(["PAYMENT_CONFIRMED", "PAYMENT_RECEIVED"])(
    "%s traz id do pagamento e valor BRUTO, não o líquido",
    async (name) => {
      const { gateway } = makeGateway(subscriptionRoute);
      const event = await gateway.handleWebhook(webhook(docsPaymentEvent(name)));
      expect(event.type).toBe("subscription.activated");
      expect(event.payment).toEqual({ externalId: "pay_080225913252", grossAmountCents: 10000 });
      expect(event.companyId).toBe("company-1");
    },
  );

  it("converte centavos sem erro de ponto flutuante", async () => {
    const { gateway } = makeGateway(subscriptionRoute);
    const event = await gateway.handleWebhook(webhook(docsPaymentEvent("PAYMENT_RECEIVED", { value: 129.9 })));
    expect(event.payment?.grossAmountCents).toBe(12990);
  });

  it("PAYMENT_OVERDUE não gera dados de pagamento", async () => {
    const { gateway } = makeGateway(subscriptionRoute);
    const event = await gateway.handleWebhook(webhook(docsPaymentEvent("PAYMENT_OVERDUE")));
    expect(event.type).toBe("payment.failed");
    expect(event.payment).toBeUndefined();
  });

  it("PAYMENT_REFUNDED é estorno integral e não consulta a assinatura", async () => {
    const { gateway, calls } = makeGateway();
    const event = await gateway.handleWebhook(webhook(docsPaymentEvent("PAYMENT_REFUNDED")));
    expect(event.type).toBe("payment.refunded");
    expect(event.refund).toEqual({ externalPaymentId: "pay_080225913252", refundedCents: null });
    // Sem o período, o billing não encerra a assinatura.
    expect(event.currentPeriodStart).not.toBeNull();
    expect(event.externalSubscriptionId).not.toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("PAYMENT_PARTIALLY_REFUNDED soma só os estornos concluídos", async () => {
    const { gateway } = makeGateway({
      "GET /payments/pay_080225913252/refunds": () => ({
        data: [
          { status: "DONE", value: 40 },
          { status: "DONE", value: 10.5 },
          { status: "PENDING", value: 30 },
          { status: "CANCELLED", value: 5 },
        ],
      }),
    });
    const event = await gateway.handleWebhook(webhook(docsPaymentEvent("PAYMENT_PARTIALLY_REFUNDED")));
    expect(event.refund).toEqual({ externalPaymentId: "pay_080225913252", refundedCents: 5050 });
  });

  it.each(["SUBSCRIPTION_DELETED", "SUBSCRIPTION_INACTIVATED"])("%s cancela a assinatura", async (name) => {
    const { gateway } = makeGateway();
    const event = await gateway.handleWebhook(
      webhook({ id: "evt_1", event: name, subscription: { id: "sub_VXJBYgP2u0eO", customer: "cus_1" } }),
    );
    expect(event.type).toBe("subscription.canceled");
    expect(event.externalSubscriptionId).toBe("sub_VXJBYgP2u0eO");
  });

  it("eventos que não tratamos e campos novos são ignorados sem erro", async () => {
    const { gateway } = makeGateway();
    const chargeback = await gateway.handleWebhook(
      webhook({ ...docsPaymentEvent("PAYMENT_CHARGEBACK_REQUESTED"), campoNovo: { x: 1 } }),
    );
    expect(chargeback.type).toBe("ignored");
  });

  describe("plano anual em 12x", () => {
    const linkRoute = {
      "GET /paymentLinks/lnk_1": () => ({ externalReference: "company-1:plan-1" }),
    };
    const parcel = (name: string, overrides: Record<string, unknown> = {}) =>
      docsPaymentEvent(name, { subscription: null, installment: "ins_1", paymentLink: "lnk_1", value: 329.9, ...overrides });

    it("parcela vira compra sem renovação, com 12 meses e valor da parcela", async () => {
      const { gateway } = makeGateway(linkRoute);
      const event = await gateway.handleWebhook(webhook(parcel("PAYMENT_CONFIRMED")));
      expect(event).toMatchObject({
        type: "subscription.activated",
        externalSubscriptionId: "ins_1",
        companyId: "company-1",
        planId: "plan-1",
        nonRenewing: true,
        installmentPayment: true,
        payment: { externalId: "pay_080225913252", grossAmountCents: 32990 },
      });
      const months = (Date.parse(event.currentPeriodEnd!) - Date.parse(event.currentPeriodStart!)) / 86_400_000;
      expect(months).toBeGreaterThanOrEqual(365);
    });

    it("aceita o parcelamento como objeto e pagamento à vista no mesmo link", async () => {
      const { gateway } = makeGateway(linkRoute);
      const asObject = await gateway.handleWebhook(webhook(parcel("PAYMENT_RECEIVED", { installment: { id: "ins_2" } })));
      expect(asObject.externalSubscriptionId).toBe("ins_2");
      const once = await gateway.handleWebhook(webhook(parcel("PAYMENT_RECEIVED", { installment: null })));
      expect(once).toMatchObject({ externalSubscriptionId: "pay_080225913252", nonRenewing: true, installmentPayment: false });
    });

    it("cobrança avulsa, fora dos nossos links, continua ignorada", async () => {
      const { gateway } = makeGateway({});
      const event = await gateway.handleWebhook(webhook(docsPaymentEvent("PAYMENT_CONFIRMED", { subscription: null, paymentLink: null })));
      expect(event.type).toBe("ignored");
    });

    it("estorno aponta para o parcelamento", async () => {
      const { gateway } = makeGateway({});
      const event = await gateway.handleWebhook(webhook(parcel("PAYMENT_REFUNDED")));
      expect(event).toMatchObject({ type: "payment.refunded", externalSubscriptionId: "ins_1" });
    });
  });
});
