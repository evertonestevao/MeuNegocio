import { brand } from "@/config/brand";

/** Texto que quem cadastra a empresa marca no último passo. Fica guardado igual na prova. */
export const OWNERSHIP_STATEMENT = `Declaro que sou responsável por esta empresa ou estou autorizado por ela a usar o ${brand.name} em seu nome, e que os dados informados são verdadeiros.`;

export const ABUSE_REASONS = {
  impersonation: "A empresa não é quem diz ser / usa o nome de outra empresa",
  suspicious_charge: "Cobrança ou pedido de pagamento suspeito",
  other: "Outro motivo",
} as const;

export type AbuseReason = keyof typeof ABUSE_REASONS;
