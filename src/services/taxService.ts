import { z } from "zod";
import { AppError } from "@/lib/errors";
import { parseMoneyToCents } from "@/lib/money";
import { TAX_REGIMES, taxRatePercentSchema } from "@/lib/tax";
import type { ActorContext } from "@/server/actor";
import type { CompanyTax } from "@/types/tax";
import { permissionService } from "./permissionService";

/**
 * Imposto estimado da empresa: regime, alíquota informada ou calculada pelo RBT12 do Simples
 * Nacional, e o faturamento informado dos meses da base. O cálculo é do banco (get_company_tax).
 */

export const SIMPLES_ANNEXES = ["III", "IV", "V"] as const;

const emptyToNull = (value: unknown) => (value === "" || value === undefined ? null : value);

export const taxSettingsSchema = z
  .object({
    taxRegime: z.preprocess(emptyToNull, z.enum(TAX_REGIMES, { error: "Escolha o regime." }).nullable()),
    taxMode: z.enum(["manual", "auto"]).default("manual"),
    taxRate: taxRatePercentSchema.optional().transform((value) => value ?? 0),
    simplesAnnex: z.preprocess(emptyToNull, z.enum(SIMPLES_ANNEXES, { error: "Escolha o anexo." }).nullable()),
    fatorR: z.preprocess((value) => value === "on" || value === true, z.boolean()),
    activityStartedOn: z.preprocess(emptyToNull, z.iso.date("Informe a data de início das atividades.").nullable()),
    cashBasis: z.preprocess((value) => value === "on" || value === true, z.boolean()),
  })
  .superRefine((value, context) => {
    if (value.taxRegime === "simples" && value.taxMode === "auto" && !value.simplesAnnex) {
      context.addIssue({ code: "custom", path: ["simplesAnnex"], message: "Para calcular pelo faturamento, escolha o anexo." });
    }
  })
  .transform(({ taxRegime, taxMode, taxRate, simplesAnnex, fatorR, activityStartedOn, cashBasis }) => {
    const simples = taxRegime === "simples";
    const auto = simples && taxMode === "auto";
    return {
      taxRegime,
      // O MEI paga valor fixo por mês: não há percentual por serviço.
      taxRateBps: taxRegime === null || taxRegime === "mei" ? 0 : taxRate,
      taxRateAuto: auto,
      simplesAnnex: simples ? simplesAnnex : null,
      fatorR: simples && simplesAnnex === "V" && fatorR,
      activityStartedOn: simples ? activityStartedOn : null,
      // Regime de caixa só muda a conta do RBT12: fora do cálculo automático, não se aplica.
      taxCashBasis: auto && cashBasis,
    };
  });

export type TaxSettingsInput = z.output<typeof taxSettingsSchema>;

const cardFeeSchema = taxRatePercentSchema.optional().transform((value, context) => {
  if ((value ?? 0) > 2000) {
    context.addIssue({ code: "custom", message: "Informe a taxa do cartão de 0 a 20%." });
    return z.NEVER;
  }
  return value ?? 0;
});

/** Taxas da maquininha em % na tela; saem em centésimos de ponto. */
export const cardFeesSchema = z.object({ creditFee: cardFeeSchema, debitFee: cardFeeSchema }).transform(({ creditFee, debitFee }) => ({
  creditBps: creditFee,
  debitBps: debitFee,
}));

export type CardFeesInput = z.output<typeof cardFeesSchema>;

const MONTH = /^\d{4}-\d{2}-01$/;

/** Faturamento informado por mês; vazio tira o valor e volta a valer o lançado no sistema. */
export const monthlyRevenuesSchema = z
  .array(z.object({ month: z.string().regex(MONTH, "Mês inválido."), amount: z.string().max(20) }))
  .max(24)
  .transform((entries, context) =>
    entries.map(({ month, amount }) => {
      if (!amount.trim()) return { month, amountCents: null };
      const cents = parseMoneyToCents(amount);
      if (cents === null || cents < 0) {
        context.addIssue({ code: "custom", message: "Informe o faturamento em reais, como 25.000,00." });
        return { month, amountCents: null };
      }
      return { month, amountCents: cents };
    }),
  );

export type MonthlyRevenueEntry = z.output<typeof monthlyRevenuesSchema>[number];

export interface TaxRepository {
  get(companyId: string): Promise<CompanyTax>;
  saveSettings(companyId: string, input: TaxSettingsInput): Promise<void>;
  saveMonthlyRevenues(companyId: string, entries: MonthlyRevenueEntry[]): Promise<void>;
  saveCardFees(companyId: string, input: CardFeesInput): Promise<void>;
}

export function createTaxService(repo: TaxRepository) {
  function requireFinance(actor: ActorContext) {
    if (!permissionService.canManageFinance(actor.role)) {
      throw new AppError("forbidden", "Só o proprietário e o administrador cuidam dos impostos");
    }
  }

  return {
    async get(actor: ActorContext): Promise<CompanyTax> {
      requireFinance(actor);
      return repo.get(actor.companyId);
    },

    /** Alíquota que vale hoje, para a estimativa do orçamento. Quem não vê custos recebe null. */
    async getRate(actor: ActorContext): Promise<number | null> {
      if (!permissionService.canManageFinance(actor.role)) return null;
      return (await repo.get(actor.companyId)).rate_bps;
    },

    async saveSettings(actor: ActorContext, input: TaxSettingsInput) {
      requireFinance(actor);
      await repo.saveSettings(actor.companyId, input);
    },

    /** Valem para as parcelas fechadas daqui para a frente; as já fechadas mantêm a taxa. */
    async saveCardFees(actor: ActorContext, input: CardFeesInput) {
      requireFinance(actor);
      await repo.saveCardFees(actor.companyId, input);
    },

    async saveMonthlyRevenues(actor: ActorContext, entries: MonthlyRevenueEntry[]) {
      requireFinance(actor);
      if (entries.length === 0) return;
      await repo.saveMonthlyRevenues(actor.companyId, entries);
    },
  };
}

export type TaxService = ReturnType<typeof createTaxService>;
