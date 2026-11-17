/** Números da Visão geral do super admin, como vêm da função admin_overview() do banco. */
export interface AdminOverviewRaw {
  generated_at: string;
  /** Receita mensal recorrente, em centavos. */
  mrr_cents: number;
  active_subscribers: number;
  past_due: number;
  trialing: number;
  trials_ending_7d: number;
  new_companies: { current: number; previous: number };
  canceled: { current: number; previous: number };
  suspended_companies: number;
  abuse_reports_7d: number;
  stuck_signups: number;
  /** Nulo quando o módulo de revendedores está desligado. */
  reseller_failures: number | null;
}
