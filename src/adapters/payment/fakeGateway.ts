import { AppError } from "@/lib/errors";
import type {
  CheckoutSession,
  CreateCheckoutParams,
  NormalizedPaymentEvent,
  WebhookRequest,
} from "@/types/billing";
import type { PaymentGateway } from "./PaymentGateway";

/** Valor histórico, usado quando FAKE_WEBHOOK_SECRET não está definido (dev/testes). */
export const DEFAULT_FAKE_WEBHOOK_SECRET = "fake-signature";

interface FakeGatewayConfig {
  /** Segredo esperado no header x-webhook-signature. */
  webhookSecret?: string;
}

/**
 * Gateway fake para desenvolvimento local e testes: não fala com provedor
 * nenhum e aceita webhooks já no formato normalizado (JSON de
 * NormalizedPaymentEvent) com o header x-webhook-signature igual ao segredo.
 * Bloqueado em produção pela trava de APP_ENV em config/env.
 */
export function createFakeGateway(config: FakeGatewayConfig = {}): PaymentGateway {
  const webhookSecret = config.webhookSecret || DEFAULT_FAKE_WEBHOOK_SECRET;
  return {
    name: "fake",
    supportsTrial: true,

    async createCheckout(params: CreateCheckoutParams): Promise<CheckoutSession> {
      return {
        id: `fake_checkout_${params.plan.id}`,
        url: `${params.successUrl}?fake_checkout=1&plan_id=${params.plan.id}`,
      };
    },

    async cancelSubscription(): Promise<void> {
      // Nada a cancelar num gateway fake.
    },

    async getPortalUrl(): Promise<string | null> {
      return null;
    },

    async handleWebhook({ payload, headers }: WebhookRequest): Promise<NormalizedPaymentEvent> {
      if (headers.get("x-webhook-signature") !== webhookSecret) {
        throw new AppError("payment_error", "Assinatura de webhook inválida");
      }
      return JSON.parse(payload) as NormalizedPaymentEvent;
    },

    async syncExtraSeats({ externalSubscriptionId, quantity }): Promise<void> {
      // Gateway fake: nada a cobrar; loga para o dev ver o ciclo funcionando.
      console.info(
        `[payment:fake] syncExtraSeats sub=${externalSubscriptionId} extras=${quantity}`,
      );
    },

    async renewSubscription(params) {
      // Gateway fake: simula o próximo termo sem chamar provedor.
      return {
        externalSubscriptionId: `fake_renew_${Date.now()}`,
        currentPeriodEnd: new Date(`${params.nextDueDate}T00:00:00Z`).toISOString(),
      };
    },
  };
}
