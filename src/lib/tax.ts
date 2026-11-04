/**
 * Imposto estimado sobre o valor cobrado. A alíquota é guardada em centésimos de ponto percentual
 * (8,43% = 843) para não perder casas em número inteiro. É estimativa para medir a margem: o valor
 * oficial é o da guia (DAS) apurada pelo contador.
 */
import { z } from "zod";
import type { TaxRegime } from "@/types/database";

export const TAX_REGIMES = ["mei", "simples", "other"] as const satisfies readonly TaxRegime[];

export const TAX_REGIME_LABEL: Record<TaxRegime, string> = {
  mei: "MEI",
  simples: "Simples Nacional",
  other: "Outro regime",
};

/** Teto da alíquota aceita: acima disso é quase certo erro de digitação. */
export const MAX_TAX_RATE_BPS = 4000;

export function taxCents(revenueCents: number, rateBps: number): number {
  if (revenueCents <= 0 || rateBps <= 0) return 0;
  return Math.round((revenueCents * rateBps) / 10_000);
}

const TAX_RATE_MESSAGE = "Informe a alíquota de 0 a 40%, com até duas casas.";

/** Campo de alíquota em % ("8,43"), validado igual no client e no server; sai em centésimos (843). Vazio é 0. */
export const taxRatePercentSchema = z
  .string({ error: TAX_RATE_MESSAGE })
  .transform((value, context) => {
    if (!value.trim()) return 0;
    const rate = parseTaxRate(value);
    if (rate === null || rate > MAX_TAX_RATE_BPS) {
      context.addIssue({ code: "custom", message: TAX_RATE_MESSAGE });
      return z.NEVER;
    }
    return rate;
  });

/** "8,43" ou "8.43" → 843. null quando não é número ou passa de duas casas. */
export function parseTaxRate(value: string): number | null {
  const normalized = value.trim().replace("%", "").trim().replace(",", ".");
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(normalized)) return null;
  return Math.round(Number(normalized) * 100);
}

/** 843 → "8,43%"; 800 → "8%". */
export function formatTaxRate(rateBps: number): string {
  return `${(rateBps / 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
}

/** Valor para o campo de edição, sem o símbolo: 843 → "8,43". */
export function taxRateInput(rateBps: number): string {
  return (rateBps / 100).toLocaleString("pt-BR", { maximumFractionDigits: 2, useGrouping: false });
}

/**
 * Alíquota padrão da empresa. Sem regime informado, não há padrão (null): o resultado fica sem
 * imposto e a tela avisa. O MEI paga valor fixo por mês, que entra como gasto fixo, não por serviço.
 */
export function companyTaxRate(profile: { tax_regime?: TaxRegime | null; tax_rate_bps?: number | null }): number | null {
  if (!profile.tax_regime) return null;
  if (profile.tax_regime === "mei") return 0;
  return profile.tax_rate_bps ?? 0;
}
