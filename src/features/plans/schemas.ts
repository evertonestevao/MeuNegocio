import { z } from "zod";
import { PLAN_FEATURES } from "@/config/planFeatures";
import { parseMoneyToCents } from "@/lib/money";

/** Validação do formulário de planos: roda no navegador e de novo no servidor. */

const moneySchema = z.string().transform((value, context) => {
  const cents = parseMoneyToCents(value);
  if (cents === null) {
    context.addIssue({ code: "custom", message: "Informe um valor válido, como 149,90." });
    return z.NEVER;
  }
  return cents;
});

const planFieldsSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome do plano.").max(60, "Use até 60 caracteres."),
  priceCents: moneySchema,
  extraSeatPriceCents: moneySchema,
  customText: z
    .string()
    .trim()
    .max(2000, "Use até 2000 caracteres no texto livre.")
    .transform((value) => value || null),
});

export const planCodeSchema = z
  .string()
  .trim()
  .regex(/^[a-z][a-z0-9_]{1,29}$/, "Use de 2 a 30 letras minúsculas, números ou _, começando por letra.");

export type PlanFeatureValues = Record<string, number | boolean | null>;

/** Lê os campos feature:<chave> do formulário. Só chaves da lista fechada entram. */
export function parsePlanFeatures(formData: FormData): PlanFeatureValues {
  const features: PlanFeatureValues = {};
  for (const feature of PLAN_FEATURES) {
    const raw = formData.get(`feature:${feature.key}`);
    if (feature.type === "flag") {
      features[feature.key] = raw === "on";
      continue;
    }
    const text = typeof raw === "string" ? raw.trim() : "";
    if (text === "") {
      features[feature.key] = null;
      continue;
    }
    if (!/^\d{1,9}$/.test(text)) {
      throw new z.ZodError([
        { code: "custom", path: [feature.key], message: `${feature.label}: use um número inteiro ou deixe vazio para ilimitado.` },
      ]);
    }
    features[feature.key] = Number(text);
  }
  return features;
}

export interface PlanFormValues {
  name: string;
  priceCents: number;
  extraSeatPriceCents: number;
  features: PlanFeatureValues;
  customText: string | null;
}

export function parsePlanForm(formData: FormData): PlanFormValues {
  const fields = planFieldsSchema.parse({
    name: formData.get("name"),
    priceCents: formData.get("price"),
    extraSeatPriceCents: formData.get("extraSeatPrice"),
    customText: formData.get("customText") ?? "",
  });
  return { ...fields, features: parsePlanFeatures(formData) };
}

/** Primeira mensagem de um erro de validação, para mostrar no formulário. */
export function firstValidationMessage(error: unknown): string | null {
  return error instanceof z.ZodError ? (error.issues[0]?.message ?? "Dados inválidos.") : null;
}
