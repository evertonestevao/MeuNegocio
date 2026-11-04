import { formatMonth } from "@/lib/calendar";
import { formatCents } from "@/lib/money";
import { formatTaxRate } from "@/lib/tax";
import type { SimplesRateDetail } from "@/types/tax";

/** A conta do mês pelo RBT12, passo a passo, para o dono conferir com o contador. */
export function TaxRateSummary({ detail, rbt12Cents, rateBps, bracket }: {
  detail: SimplesRateDetail;
  /** Prévia enquanto a pessoa edita os meses; sem ela, os valores salvos. */
  rbt12Cents?: number;
  rateBps?: number;
  bracket?: { bracket: number; nominalBps: number; deductionCents: number };
}) {
  const rbt12 = rbt12Cents ?? detail.rbt12_cents;
  const rate = rateBps ?? detail.rate_bps;
  const faixa = bracket ?? { bracket: detail.bracket, nominalBps: detail.nominal_bps, deductionCents: detail.deduction_cents };

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-muted/60 p-4 text-sm">
      <p className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-medium">Alíquota de {formatMonth(detail.month).toLowerCase()}</span>
        <span className="font-heading text-2xl font-extrabold tabular-nums">{formatTaxRate(rate)}</span>
      </p>
      <dl className="grid gap-1 text-muted-foreground sm:grid-cols-[auto_1fr] sm:gap-x-4">
        <dt>Faturamento dos 12 meses (RBT12)</dt>
        <dd className="font-medium text-foreground tabular-nums">{formatCents(rbt12)}</dd>
        <dt>Anexo e faixa</dt>
        <dd className="text-foreground">
          Anexo {detail.effective_annex}, faixa {faixa.bracket}: nominal {formatTaxRate(faixa.nominalBps)}, dedução {formatCents(faixa.deductionCents)}
        </dd>
      </dl>
      {rbt12 > 0 ? (
        <p className="text-xs text-muted-foreground tabular-nums">
          ({formatCents(rbt12)} × {formatTaxRate(faixa.nominalBps)} − {formatCents(faixa.deductionCents)}) ÷ {formatCents(rbt12)} = {formatTaxRate(rate)}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">Sem faturamento nos meses anteriores: vale a alíquota da primeira faixa.</p>
      )}
      {detail.annex !== detail.effective_annex ? (
        <p className="text-xs text-muted-foreground">Anexo V tributado pelo Anexo III por causa do Fator R.</p>
      ) : null}
      {detail.months > 0 && detail.months < 12 ? (
        <p className="text-xs text-muted-foreground">
          Empresa com {detail.months} {detail.months === 1 ? "mês" : "meses"} de atividade: o RBT12 é a média desses meses × 12.
        </p>
      ) : null}
      {rbt12 > 480_000_000 ? (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
          O faturamento passou do teto do Simples Nacional (R$ 4,8 milhões). Fale com o contador.
        </p>
      ) : null}
    </div>
  );
}
