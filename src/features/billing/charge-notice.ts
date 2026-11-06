import { formatCents } from "@/lib/money";
import type { Subscription } from "@/types/database";

const day = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

/**
 * Quando vem a próxima cobrança de uma assinatura que renova. No teste com cartão, a data da
 * primeira cobrança e o valor, como prometido na hora de assinar. Null quando não há cobrança à
 * frente (teste sem cartão, compra parcelada, cancelada).
 */
export function nextChargeNotice(subscription: Pick<Subscription, "status" | "renews" | "cancel_at_period_end" | "current_period_end" | "contracted_price_cents"> | null): string | null {
  if (!subscription?.renews || !subscription.current_period_end || subscription.cancel_at_period_end) return null;
  const date = day(subscription.current_period_end);
  if (subscription.status === "trialing") {
    return `Teste grátis até ${date}. A primeira cobrança, de ${formatCents(subscription.contracted_price_cents)}, será nessa data. Cancele antes e não paga nada.`;
  }
  if (subscription.status === "active") return `Próxima cobrança em ${date}.`;
  return null;
}
