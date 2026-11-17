import { formatCents } from "@/lib/money";
import type { AdminOverviewRaw } from "@/types/adminOverview";

/**
 * Visão geral do super admin: transforma os números do banco em indicadores e na lista "Precisa da
 * sua atenção". Sem lógica visual. As contas (taxa de cancelamento, diferença entre períodos, ordem
 * dos alertas) ficam aqui para serem testadas.
 */

export interface AdminOverviewRepository {
  get(): Promise<AdminOverviewRaw>;
}

export type DeltaTone = "good" | "bad" | "neutral";
export type DeltaDirection = "up" | "down" | "flat";

export interface OverviewDelta {
  /** Para onde o número foi (a seta); se isso é bom ou ruim é o `tone` (a cor). */
  direction: DeltaDirection;
  /** Diferença com sinal em relação ao período anterior: "+2", "−1" ou "0". */
  change: string;
  /** Como ler: "vs. 3 nos 30 dias anteriores". */
  reference: string;
  tone: DeltaTone;
}

export interface OverviewTile {
  key: "mrr" | "subscribers" | "trialing" | "newCompanies" | "canceled" | "pastDue";
  label: string;
  value: string;
  /** Explica o número em uma linha. */
  hint?: string;
  delta?: OverviewDelta;
  /** Destaca o indicador quando há algo errado (ex.: cobranças em atraso). */
  alert?: boolean;
}

export type AttentionTone = "critical" | "warning" | "info";

export interface AttentionItem {
  key: string;
  label: string;
  count: number;
  href: string;
  tone: AttentionTone;
}

export interface AdminOverview {
  generatedAt: string;
  tiles: OverviewTile[];
  attention: AttentionItem[];
}

const MINUS = "−";

/** Percentual com uma casa, ou null quando não há base (ninguém assinando e ninguém cancelando). */
export function churnPercent(canceled: number, activeSubscribers: number): number | null {
  const base = activeSubscribers + canceled;
  if (base <= 0) return null;
  return Math.round((canceled / base) * 1000) / 10;
}

/**
 * Diferença entre o período atual e o anterior. `upIsGood` diz se subir é bom (novas empresas) ou
 * ruim (cancelamentos). Sem mudança, o tom é neutro.
 */
export function periodDelta(current: number, previous: number, upIsGood: boolean): OverviewDelta {
  const diff = current - previous;
  const change = diff === 0 ? "0" : diff > 0 ? `+${diff}` : `${MINUS}${Math.abs(diff)}`;
  const tone: DeltaTone = diff === 0 ? "neutral" : (diff > 0) === upIsGood ? "good" : "bad";
  const direction: DeltaDirection = diff === 0 ? "flat" : diff > 0 ? "up" : "down";
  return { direction, change, reference: `vs. ${previous} nos 30 dias anteriores`, tone };
}

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

export function buildOverview(raw: AdminOverviewRaw): AdminOverview {
  const churn = churnPercent(raw.canceled.current, raw.active_subscribers);

  const tiles: OverviewTile[] = [
    {
      key: "mrr",
      label: "Receita mensal recorrente",
      value: formatCents(raw.mrr_cents),
      hint: "Só assinaturas com cobrança. O anual conta dividido por 12; vagas extras não entram.",
    },
    {
      key: "subscribers",
      label: "Assinantes ativos",
      value: String(raw.active_subscribers),
      hint: raw.active_subscribers === 0 ? "Ninguém assinando ainda." : "Pagando em dia.",
    },
    {
      key: "trialing",
      label: "Em teste grátis",
      value: String(raw.trialing),
      hint:
        raw.trials_ending_7d > 0
          ? `${raw.trials_ending_7d} ${plural(raw.trials_ending_7d, "termina", "terminam")} em até 7 dias`
          : "Nenhum termina nos próximos 7 dias",
    },
    {
      key: "newCompanies",
      label: "Novas empresas (30 dias)",
      value: String(raw.new_companies.current),
      delta: periodDelta(raw.new_companies.current, raw.new_companies.previous, true),
    },
    {
      key: "canceled",
      label: "Cancelamentos (30 dias)",
      value: String(raw.canceled.current),
      delta: periodDelta(raw.canceled.current, raw.canceled.previous, false),
      hint: churn === null ? undefined : `Taxa de cancelamento: ${String(churn).replace(".", ",")}%`,
    },
    {
      key: "pastDue",
      label: "Cobranças em atraso",
      value: String(raw.past_due),
      hint: raw.past_due === 0 ? "Nenhuma assinatura atrasada." : "Assinaturas com pagamento atrasado.",
      alert: raw.past_due > 0,
    },
  ];

  const candidates: AttentionItem[] = [
    { key: "past-due", label: "Cobranças em atraso", count: raw.past_due, href: "/admin/empresas", tone: "critical" },
    { key: "suspended", label: "Empresas suspensas", count: raw.suspended_companies, href: "/admin/empresas", tone: "warning" },
    { key: "abuse", label: "Denúncias nos últimos 7 dias", count: raw.abuse_reports_7d, href: "/admin/denuncias", tone: "warning" },
    { key: "reseller-failures", label: "Falhas de comissão sem resolver", count: raw.reseller_failures ?? 0, href: "/admin/revendedores/falhas", tone: "warning" },
    { key: "trials-ending", label: "Testes que terminam em até 7 dias", count: raw.trials_ending_7d, href: "/admin/empresas", tone: "info" },
    { key: "stuck-signups", label: "Cadastros parados há mais de 2 dias", count: raw.stuck_signups, href: "/admin/cadastros", tone: "info" },
  ];
  const order: Record<AttentionTone, number> = { critical: 0, warning: 1, info: 2 };
  // Só entra o que tem algo a fazer; dentro da mesma gravidade, mantém a ordem acima.
  const attention = candidates
    .filter((item) => item.count > 0)
    .toSorted((a, b) => order[a.tone] - order[b.tone]);

  return { generatedAt: raw.generated_at, tiles, attention };
}

export function createAdminOverviewService(repo: AdminOverviewRepository) {
  return {
    async get(): Promise<AdminOverview> {
      return buildOverview(await repo.get());
    },
  };
}

export type AdminOverviewService = ReturnType<typeof createAdminOverviewService>;
