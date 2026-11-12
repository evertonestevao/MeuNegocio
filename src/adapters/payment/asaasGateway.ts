import { AppError } from "@/lib/errors";
import type {
  CheckoutSession,
  CreateCheckoutParams,
  ExtraSeatsUpdate,
  NormalizedPaymentEvent,
  PaymentEventType,
  WebhookRequest,
} from "@/types/billing";
import type { PaymentGateway } from "./PaymentGateway";

/**
 * Adapter Asaas via API REST v3 (fetch + JSON), sem SDK.
 *
 * Fluxo:
 *  - Checkout MENSAL: cria um Checkout hospedado RECORRENTE (POST /checkouts) com
 *    um bloco `subscription`. A página do Asaas coleta o cartão (o cartão nunca
 *    passa pelo nosso servidor) e cria cliente + assinatura. `nextDueDate` define
 *    a data da PRIMEIRA cobrança: hoje + trialDays. Com trialDays > 0 o cliente
 *    cadastra o cartão agora e só é cobrado no fim do teste — por isso o teste
 *    exige cartão (billingType CREDIT_CARD). `externalReference` leva
 *    "<companyId>:<planId>" para o webhook achar a empresa.
 *  - Checkout ANUAL: continua como Link de Pagamento PARCELADO, em até 12x no
 *    cartão: uma compra única, sem assinatura no Asaas, que dá 12 meses de
 *    acesso e não renova.
 *  - Webhook: autenticado pelo header `asaas-access-token` (token definido
 *    ao cadastrar o webhook no painel). CHECKOUT_PAID cria a assinatura em teste
 *    (trialing) antes da primeira cobrança; pagamento confirmado de uma
 *    assinatura ativa ou renova o plano; vencido vira past_due; estorno vira
 *    payment.refunded.
 *  - Seats extras: Asaas cobra por valor, então o adapter atualiza o valor
 *    total da assinatura (plano + extras × preço unitário).
 *  - Portal: o Asaas não tem portal de autogestão — getPortalUrl devolve null.
 */

const ANNUAL_MAX_INSTALLMENTS = 12;

/** Expiração do checkout hospedado, em minutos (limite do Asaas: 10 a 1440). */
const CHECKOUT_EXPIRES_MINUTES = 60;

/** PNG 1x1 transparente: o item do checkout exige imageBase64, mas não a usamos. */
const CHECKOUT_ITEM_IMAGE =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

/**
 * billingTypes aceitos no Checkout hospedado. O checkout usa um array (não o
 * UNDEFINED do link). Boleto não entra: assinatura recorrente no Asaas é cartão
 * ou PIX, e só o cartão pode guardar o meio para a cobrança futura do teste.
 */
function checkoutBillingTypes(methods: string[]): Array<"CREDIT_CARD" | "PIX"> {
  const types: Array<"CREDIT_CARD" | "PIX"> = [];
  if (methods.includes("credit_card")) types.push("CREDIT_CARD");
  if (methods.includes("pix")) types.push("PIX");
  return types.length > 0 ? types : ["CREDIT_CARD"];
}

/** Data (YYYY-MM-DD, fuso local do servidor) daqui a `days` dias — nextDueDate do Asaas. */
function dueDateString(days: number, now: Date = new Date()): string {
  const date = new Date(now);
  date.setDate(date.getDate() + Math.max(0, Math.trunc(days)));
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const API_URLS = {
  sandbox: "https://api-sandbox.asaas.com/v3",
  production: "https://api.asaas.com/v3",
} as const;

interface AsaasGatewayConfig {
  apiKey: string;
  webhookToken: string;
  environment: keyof typeof API_URLS;
  /** Injetável nos testes (default: fetch global). */
  fetchFn?: typeof fetch;
}

/** Centavos -> reais com 2 casas (a API do Asaas recebe valores decimais). */
function toReais(cents: number): number {
  return Math.round(cents) / 100;
}

/** Comparação em tempo constante (token do webhook). */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/** externalReference no formato "<companyId>:<planId>". */
export function parseExternalReference(
  value: string | null | undefined,
): { companyId: string; planId: string } | null {
  if (!value) return null;
  const [companyId, planId] = value.split(":");
  return companyId && planId ? { companyId, planId } : null;
}

const ASAAS_EVENT_MAP: Record<string, PaymentEventType> = {
  // Checkout hospedado concluído: a assinatura foi criada (em teste, se a 1ª
  // cobrança é futura). É o ÚNICO evento que traz o externalReference (empresa:plano),
  // porque a assinatura/cobrança criadas pelo checkout vêm sem ele.
  CHECKOUT_PAID: "subscription.activated",
  PAYMENT_CONFIRMED: "subscription.activated",
  PAYMENT_RECEIVED: "subscription.activated",
  PAYMENT_OVERDUE: "payment.failed",
  SUBSCRIPTION_DELETED: "subscription.canceled",
  SUBSCRIPTION_INACTIVATED: "subscription.canceled",
  PAYMENT_REFUNDED: "payment.refunded",
  PAYMENT_PARTIALLY_REFUNDED: "payment.refunded",
};

/** Eventos de cobrança efetivamente paga (geram comissão e assinatura ativa). */
const PAID_EVENTS = new Set(["PAYMENT_CONFIRMED", "PAYMENT_RECEIVED"]);

interface AsaasWebhookEvent {
  event?: string;
  payment?: {
    id?: string;
    /** Valor bruto da cobrança, em reais. O líquido é netValue, que não usamos. */
    value?: number;
    customer?: string;
    subscription?: string | null;
    /** Só em cobrança de parcelamento: o id, ou o objeto com o id. */
    installment?: string | { id?: string } | null;
    paymentLink?: string | null;
    externalReference?: string | null;
    dueDate?: string;
  };
  subscription?: {
    id?: string;
    customer?: string;
    externalReference?: string | null;
    nextDueDate?: string;
  };
  checkout?: {
    id?: string;
    externalReference?: string | null;
    /** Bloco da assinatura: nextDueDate é a data da 1ª cobrança (fim do teste). */
    subscription?: { nextDueDate?: string } | null;
  };
}

interface AsaasSubscription {
  id: string;
  customer?: string;
  externalReference?: string | null;
  nextDueDate?: string;
  /** Id do checkout que originou a assinatura — como a ligamos ao CHECKOUT_PAID. */
  checkoutSession?: string | null;
}

interface AsaasRefund {
  status?: string;
  value?: number;
}

/** Reais -> centavos, sem erro de ponto flutuante. */
function toCents(reais: number): number {
  return Math.round(reais * 100);
}

/**
 * Data do Asaas -> ISO em UTC; null se ausente ou inválida. Aceita só data
 * ("2026-10-26", tratada como meia-noite UTC) e timestamp completo
 * ("2026-11-26T03:00:00+0000", como vem no bloco subscription do checkout).
 */
function dateToIso(date: string | undefined | null): string | null {
  if (!date) return null;
  const parsed = new Date(date.includes("T") ? date : `${date}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function installmentId(installment: string | { id?: string } | null | undefined): string | null {
  if (!installment) return null;
  return typeof installment === "string" ? installment : (installment.id ?? null);
}

export function createAsaasGateway(config: AsaasGatewayConfig): PaymentGateway {
  const baseUrl = API_URLS[config.environment];
  const fetchFn = config.fetchFn ?? fetch;

  async function asaasRequest<T = Record<string, unknown>>(
    path: string,
    method: "GET" | "POST" | "PUT" | "DELETE",
    body?: Record<string, unknown>,
  ): Promise<T> {
    const res = await fetchFn(`${baseUrl}${path}`, {
      method,
      headers: {
        access_token: config.apiKey,
        "Content-Type": "application/json",
        "User-Agent": "starterkit-saas",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = (await res.json().catch(() => ({}))) as T;
    if (!res.ok) {
      // Detalhe do provedor vai só para o log de servidor via `internal`.
      throw new AppError("payment_error", "Falha na operação de pagamento", json);
    }
    return json;
  }

  /**
   * Empresa e plano de um evento: externalReference da assinatura e, como
   * fallback, do link de pagamento que a originou.
   */
  async function resolveReference(
    subscription: AsaasSubscription | null,
    paymentLinkId: string | null | undefined,
  ) {
    const fromSubscription = parseExternalReference(subscription?.externalReference);
    if (fromSubscription) return fromSubscription;
    if (!paymentLinkId) return null;
    const link = await asaasRequest<{ externalReference?: string | null }>(
      `/paymentLinks/${paymentLinkId}`,
      "GET",
    );
    return parseExternalReference(link.externalReference);
  }

  async function normalize(event: AsaasWebhookEvent): Promise<NormalizedPaymentEvent> {
    const type = ASAAS_EVENT_MAP[event.event ?? ""] ?? "ignored";
    const base: NormalizedPaymentEvent = {
      type: "ignored",
      gateway: "asaas",
      externalSubscriptionId: null,
      externalCustomerId: null,
      companyId: null,
      planId: null,
      currentPeriodStart: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    };
    if (type === "ignored") return base;

    // Checkout hospedado concluído. Traz o externalReference (empresa:plano) e a data
    // da 1ª cobrança, mas NÃO o id da assinatura criada — então achamos a assinatura
    // pelo campo checkoutSession (= id do checkout). Com vencimento futuro, entra
    // "em teste"; com vencimento hoje (sem teste), entra ativa.
    if (event.event === "CHECKOUT_PAID") {
      const checkoutId = event.checkout?.id;
      const reference = parseExternalReference(event.checkout?.externalReference);
      if (!checkoutId || !reference) return base;
      // Não há filtro por checkoutSession na API: lista as assinaturas recentes e casa
      // pelo campo. A recém-criada vem no topo (ordem decrescente).
      const list = await asaasRequest<{ data?: AsaasSubscription[] }>(`/subscriptions?limit=100&offset=0`, "GET");
      const subscription = (list.data ?? []).find((s) => s.checkoutSession === checkoutId);
      if (!subscription) return base;
      const firstChargeIso = dateToIso(event.checkout?.subscription?.nextDueDate ?? subscription.nextDueDate);
      const inTrial = firstChargeIso !== null && Date.parse(firstChargeIso) > Date.now();
      return {
        ...base,
        type: "subscription.activated",
        externalSubscriptionId: subscription.id,
        externalCustomerId: subscription.customer ?? null,
        companyId: reference.companyId,
        planId: reference.planId,
        currentPeriodStart: new Date().toISOString(),
        currentPeriodEnd: firstChargeIso,
        trialEndsAt: inTrial ? firstChargeIso : null,
      };
    }

    if (type === "subscription.canceled") {
      const subscription = event.subscription;
      if (!subscription?.id) return base;
      const reference = parseExternalReference(subscription.externalReference);
      return {
        ...base,
        type,
        externalSubscriptionId: subscription.id,
        externalCustomerId: subscription.customer ?? null,
        companyId: reference?.companyId ?? null,
        planId: reference?.planId ?? null,
      };
    }

    if (type === "payment.refunded") {
      const paymentId = event.payment?.id;
      if (!paymentId) return base;
      // Integral: total null. Parcial: soma dos estornos concluídos (status DONE), que
      // é o que a documentação manda considerar. Sem consultar a assinatura, que pode
      // já estar cancelada.
      let refundedCents: number | null = null;
      if (event.event === "PAYMENT_PARTIALLY_REFUNDED") {
        const refunds = await asaasRequest<{ data?: AsaasRefund[] }>(
          `/payments/${paymentId}/refunds`,
          "GET",
        );
        refundedCents = (refunds.data ?? [])
          .filter((refund) => refund.status === "DONE")
          .reduce((total, refund) => total + toCents(refund.value ?? 0), 0);
      }
      return {
        ...base,
        type,
        // Compra parcelada não tem assinatura no Asaas: o id é o do parcelamento.
        externalSubscriptionId:
          event.payment?.subscription ?? installmentId(event.payment?.installment) ?? (event.payment?.paymentLink ? (paymentId ?? null) : null),
        externalCustomerId: event.payment?.customer ?? null,
        // Identifica a qual período a cobrança estornada pertence.
        currentPeriodStart: dateToIso(event.payment?.dueDate),
        refund: { externalPaymentId: paymentId, refundedCents },
      };
    }

    const payment = event.payment;
    const paid = PAID_EVENTS.has(event.event ?? "");
    const isActivation = type === "subscription.activated";
    // Compra do plano anual: vem de um link nosso e não tem assinatura. Cobrança avulsa é ignorada.
    if (payment && !payment.subscription) {
      // Anual só libera acesso quando a parcela é efetivamente paga. Vencimento (payment.failed) segue.
      if (isActivation && !paid) return base;
      const reference = await resolveReference(null, payment.paymentLink);
      if (!reference || !payment.id) return base;
      const parcel = installmentId(payment.installment);
      const start = new Date();
      const end = new Date(start);
      end.setFullYear(end.getFullYear() + 1);
      return {
        ...base,
        type,
        externalSubscriptionId: parcel ?? payment.id,
        externalCustomerId: payment.customer ?? null,
        companyId: reference.companyId,
        planId: reference.planId,
        currentPeriodStart: start.toISOString(),
        currentPeriodEnd: end.toISOString(),
        nonRenewing: true,
        installmentPayment: parcel !== null,
        payment: paid && payment.value ? { externalId: payment.id, grossAmountCents: toCents(payment.value) } : undefined,
      };
    }
    if (!payment?.subscription) return base;
    const subscription = await asaasRequest<AsaasSubscription>(
      `/subscriptions/${payment.subscription}`,
      "GET",
    );
    // A assinatura criada pelo checkout vem sem externalReference; o vínculo com a
    // empresa já foi gravado no CHECKOUT_PAID. Aqui casamos pelo id da assinatura
    // (findSubscriptionByExternalId no service), então seguimos mesmo sem reference —
    // é a cobrança real (fim do teste ou renovação) que ativa/renova a assinatura.
    const reference = await resolveReference(subscription, payment.paymentLink);
    return {
      ...base,
      type,
      externalSubscriptionId: payment.subscription,
      externalCustomerId: payment.customer ?? subscription.customer ?? null,
      companyId: reference?.companyId ?? null,
      planId: reference?.planId ?? null,
      currentPeriodStart: dateToIso(payment.dueDate),
      currentPeriodEnd: dateToIso(subscription.nextDueDate),
      // Só pagamento confirmado gera comissão. CONFIRMED e RECEIVED da mesma cobrança
      // têm o mesmo id, e o par único no banco evita o lançamento duplicado.
      payment: paid && payment.id && payment.value ? { externalId: payment.id, grossAmountCents: toCents(payment.value) } : undefined,
    };
  }

  /** Checkout hospedado MENSAL com assinatura e 1ª cobrança em nextDueDate. */
  async function createSubscriptionCheckout(params: CreateCheckoutParams): Promise<CheckoutSession> {
    const trialDays = params.trialDays ?? 0;
    // Com teste, só cartão: PIX/boleto não guardam o meio para a cobrança futura.
    const billingTypes = trialDays > 0 ? (["CREDIT_CARD"] as const) : checkoutBillingTypes(params.plan.paymentMethods);
    const checkout = await asaasRequest<{ id: string; link: string }>("/checkouts", "POST", {
      billingTypes,
      chargeTypes: ["RECURRENT"],
      minutesToExpire: CHECKOUT_EXPIRES_MINUTES,
      externalReference: `${params.companyId}:${params.plan.id}`,
      // O domínio de successUrl/cancelUrl precisa estar cadastrado nas informações
      // comerciais da conta Asaas, senão a API recusa o checkout.
      callback: { successUrl: params.successUrl, cancelUrl: params.cancelUrl, expiredUrl: params.cancelUrl },
      items: [
        {
          name: params.plan.name.slice(0, 30),
          description: `Assinatura do plano ${params.plan.name}`.slice(0, 150),
          quantity: 1,
          value: toReais(params.plan.priceCents),
          // O schema de itens do checkout exige uma imagem; usamos um 1x1 transparente.
          imageBase64: CHECKOUT_ITEM_IMAGE,
        },
      ],
      subscription: {
        cycle: "MONTHLY",
        // Primeira cobrança: hoje + dias de teste. 0 dias = cobra hoje (sem teste).
        nextDueDate: dueDateString(trialDays),
      },
      // Sem customerData: a página do Asaas coleta nome, CPF, telefone e endereço do
      // comprador. Enviar customerData parcial é recusado (exige todos esses campos).
    });
    return { id: checkout.id, url: checkout.link };
  }

  /** Plano anual: Link de Pagamento PARCELADO (compra única em até 12x). */
  async function createAnnualLink(params: CreateCheckoutParams): Promise<CheckoutSession> {
    const link = await asaasRequest<{ id: string; url: string }>("/paymentLinks", "POST", {
      name: params.plan.name,
      description: `Assinatura do plano ${params.plan.name}`,
      value: toReais(params.plan.priceCents),
      billingType: "CREDIT_CARD",
      chargeType: "INSTALLMENT",
      maxInstallmentCount: ANNUAL_MAX_INSTALLMENTS,
      dueDateLimitDays: 3,
      externalReference: `${params.companyId}:${params.plan.id}`,
      callback: { successUrl: params.successUrl, autoRedirect: true },
    });
    return { id: link.id, url: link.url };
  }

  return {
    name: "asaas",
    // O Checkout hospedado aceita nextDueDate futuro: o cartão é guardado na página
    // do Asaas e a 1ª cobrança só acontece no fim do teste.
    supportsTrial: true,

    async createCheckout(params: CreateCheckoutParams): Promise<CheckoutSession> {
      // Anual é compra parcelada (não há teste em parcelamento). Mensal vai pelo
      // checkout com assinatura, com ou sem teste.
      return params.plan.billingInterval === "year"
        ? createAnnualLink(params)
        : createSubscriptionCheckout(params);
    },

    async cancelSubscription(externalSubscriptionId: string): Promise<void> {
      // Remove as cobranças futuras; o acesso até o fim do período é controlado no app.
      await asaasRequest(`/subscriptions/${externalSubscriptionId}`, "DELETE");
    },

    async getPortalUrl(): Promise<string | null> {
      return null;
    },

    async handleWebhook({ payload, headers }: WebhookRequest): Promise<NormalizedPaymentEvent> {
      const token = headers.get("asaas-access-token") ?? "";
      if (!token || !safeEqual(token, config.webhookToken)) {
        throw new AppError("payment_error", "Token de webhook inválido");
      }
      let event: AsaasWebhookEvent;
      try {
        event = JSON.parse(payload) as AsaasWebhookEvent;
      } catch {
        throw new AppError("payment_error", "Payload de webhook inválido");
      }
      return normalize(event);
    },

    async syncExtraSeats(update: ExtraSeatsUpdate): Promise<void> {
      const totalCents = update.basePriceCents + update.quantity * update.unitPriceCents;
      await asaasRequest(`/subscriptions/${update.externalSubscriptionId}`, "PUT", {
        value: toReais(totalCents),
        // Atualiza também a cobrança já gerada e ainda não paga.
        updatePendingPayments: true,
      });
    },
  };
}
