import type { TaxRegime } from "./database";

/** Anexos do Simples Nacional para serviços. */
export type SimplesAnnex = "III" | "IV" | "V";

/** Cálculo do mês pelo RBT12 (get_company_tax.detail). */
export interface SimplesRateDetail {
  month: string;
  annex: SimplesAnnex;
  effective_annex: SimplesAnnex;
  /** Soma dos meses da base, antes da média de início de atividade. */
  revenue_cents: number;
  months: number;
  rbt12_cents: number;
  bracket: number;
  nominal_bps: number;
  deduction_cents: number;
  rate_bps: number;
  over_limit: boolean;
}

export interface TaxMonth {
  month: string;
  /** Faturamento dos orçamentos fechados no mês. */
  launched_cents: number;
  /** Informado pela empresa; quando existe, vale no lugar do lançado. */
  informed_cents: number | null;
}

/** Configuração do imposto da empresa, a alíquota de hoje e a base do cálculo (get_company_tax). */
export interface CompanyTax {
  regime: TaxRegime | null;
  manual_rate_bps: number;
  auto: boolean;
  annex: SimplesAnnex | null;
  fator_r: boolean;
  activity_started_on: string | null;
  /** RBT12 pelo recebido (regime de caixa), em vez do faturado. */
  cash_basis: boolean;
  /** Alíquota que vale hoje; null sem regime informado. */
  rate_bps: number | null;
  detail: SimplesRateDetail | null;
  /** Os 12 meses anteriores, do mais recente ao mais antigo. */
  months: TaxMonth[];
}
