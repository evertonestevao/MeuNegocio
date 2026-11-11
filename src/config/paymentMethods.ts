/** Meios de pagamento que um plano pode aceitar no checkout. Lista fechada. */
export const PAYMENT_METHODS = [
  { key: "credit_card", label: "Cartão de crédito" },
  { key: "pix", label: "PIX" },
  { key: "boleto", label: "Boleto" },
] as const;

export type PaymentMethodKey = (typeof PAYMENT_METHODS)[number]["key"];

export const PAYMENT_METHOD_KEYS: PaymentMethodKey[] = PAYMENT_METHODS.map((method) => method.key);

/** Padrão: só cartão (adiar a 1ª cobrança do teste grátis exige cartão). */
export const DEFAULT_PAYMENT_METHODS: PaymentMethodKey[] = ["credit_card"];

export const DEFAULT_TRIAL_DAYS = 7;

export function paymentMethodLabel(key: string): string {
  return PAYMENT_METHODS.find((method) => method.key === key)?.label ?? key;
}
