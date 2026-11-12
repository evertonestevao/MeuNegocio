/** Types de billing neutros de provedor — nada de stripe_* fora do adapter. */

/**
 * Plano como o gateway o recebe: valor E id externo opcional. Gateways com
 * catálogo de preços (Stripe) usam `externalPriceId`; gateways que cobram por
 * valor (Asaas, Mercado Pago) usam `priceCents`.
 */
export interface CheckoutPlan {
  id: string;
  code: string;
  name: string;
  priceCents: number;
  currency: string;
  billingInterval: "month" | "year";
  /** Id do preço no catálogo do gateway (PAYMENT_PRICE_<PLANO>), ou null. */
  externalPriceId: string | null;
  /** Meios aceitos no checkout (credit_card, pix, boleto). Define o billingType no gateway. */
  paymentMethods: string[];
}

export interface CreateCheckoutParams {
  companyId: string;
  plan: CheckoutPlan;
  customer: { email: string; name: string | null };
  successUrl: string;
  cancelUrl: string;
  /** Teste com cartão: a primeira cobrança só depois destes dias. Só em gateway com supportsTrial. */
  trialDays?: number;
}

/** Request de webhook como chega na rota: cada gateway lê o próprio header. */
export interface WebhookRequest {
  payload: string;
  headers: Headers;
}

/**
 * Cobrança de seats extras. Cada gateway aplica do seu jeito: item com
 * quantidade (Stripe) ou novo valor total da assinatura (Asaas).
 */
export interface ExtraSeatsUpdate {
  externalSubscriptionId: string;
  /** Seats além do incluso no plano; 0 remove a cobrança extra. */
  quantity: number;
  unitPriceCents: number;
  /** Valor do plano base, para gateways que cobram um valor total. */
  basePriceCents: number;
  /** Id do preço por seat no catálogo do gateway (PAYMENT_PRICE_EXTRA_SEAT), ou null. */
  externalPriceId: string | null;
}

export interface CheckoutSession {
  id: string;
  url: string;
}

/**
 * Eventos de webhook de QUALQUER gateway são normalizados para estes tipos
 * antes de tocar a lógica de negócio (ver starter-kit-saas-plano.md §7).
 */
export type PaymentEventType =
  | "subscription.activated"
  | "subscription.updated"
  | "subscription.canceled"
  | "payment.failed"
  | "payment.refunded"
  | "ignored";

export interface NormalizedPaymentEvent {
  type: PaymentEventType;
  gateway: string;
  externalSubscriptionId: string | null;
  externalCustomerId: string | null;
  /** Vindos de metadata gravada na criação do checkout. */
  companyId: string | null;
  planId: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  /** Compra parcelada: não renova e vale até currentPeriodEnd. */
  nonRenewing?: boolean;
  /** Teste com cartão: a primeira cobrança é nesta data. */
  trialEndsAt?: string | null;
  /** Parcela de uma compra: cobre 1 mês, mesmo em plano anual. */
  installmentPayment?: boolean;
  /** Pagamento confirmado que gerou o evento. Sem isto, não há comissão (ex.: Stripe). */
  payment?: { externalId: string; grossAmountCents: number };
  /** Estorno: total estornado até agora; null = integral. */
  refund?: { externalPaymentId: string; refundedCents: number | null };
  /** Gateway que criou a assinatura (gravado na assinatura para multigateway). */
  gatewayProvider?: string;
  /** Token do meio de pagamento para renovar sem nova entrada de cartão. */
  paymentMethodToken?: string | null;
  /**
   * Termo (ex.: anual em 12x) chegou à última parcela: o handler deve renovar
   * criando o próximo termo com estes dados, sem o cliente pagar de novo.
   */
  termRenewal?: {
    externalCustomerId: string;
    paymentMethodToken: string;
    valueCents: number;
    maxPayments: number;
    /** Início do próximo termo (YYYY-MM-DD): o mês seguinte à última cobrança. */
    nextDueDate: string;
  };
}

/** Renovação de um termo recorrente (ex.: anual em 12x) usando o cartão tokenizado. */
export interface RenewSubscriptionParams {
  externalCustomerId: string;
  paymentMethodToken: string;
  valueCents: number;
  maxPayments: number;
  nextDueDate: string;
  /** "<companyId>:<planId>" — leva a empresa/plano para os eventos do novo termo. */
  externalReference: string;
}

export interface RenewedSubscription {
  externalSubscriptionId: string;
  currentPeriodEnd: string | null;
}
