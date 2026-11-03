import { sampleServiceResult } from "@/features/marketing/content";
import { formatCents } from "@/lib/money";

/** Exemplo de resultado de um serviço, com valores fictícios e avisados como tal. Só visual. */
export function SampleServiceResult() {
  const { service, client, chargedCents, costs } = sampleServiceResult;
  const costCents = costs.reduce((sum, cost) => sum + cost.cents, 0);
  const resultCents = chargedCents - costCents;
  const margin = Math.round((resultCents / chargedCents) * 100);

  return (
    <figure className="lp-reveal flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-xl sm:p-6">
      <figcaption className="flex flex-col gap-0.5">
        <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Resultado do serviço</span>
        <span className="font-heading text-lg font-bold">{service}</span>
        <span className="text-sm text-muted-foreground">{client}</span>
      </figcaption>

      <div className="flex items-baseline justify-between gap-3 border-b pb-3">
        <span className="text-sm text-muted-foreground">Valor cobrado</span>
        <span className="font-semibold tabular-nums">{formatCents(chargedCents)}</span>
      </div>
      <ul className="flex flex-col gap-2.5 text-sm">
        {costs.map((cost) => (
          <li key={cost.label} className="flex items-baseline justify-between gap-3">
            <span className="flex min-w-0 flex-col">
              <span>{cost.label}</span>
              <span className="text-xs text-muted-foreground">{cost.detail}</span>
            </span>
            <span className="shrink-0 tabular-nums text-destructive">− {formatCents(cost.cents)}</span>
          </li>
        ))}
      </ul>

      {/* Barra única: quanto do valor cobrado virou custo e quanto sobrou. */}
      <div className="flex h-3 overflow-hidden rounded-full bg-muted" role="img" aria-label={`Custos de ${formatCents(costCents)} e resultado de ${formatCents(resultCents)}`}>
        <span className="bg-chart-expense" style={{ width: `${(costCents / chargedCents) * 100}%` }} />
        <span className="ml-0.5 bg-success" style={{ width: `${(resultCents / chargedCents) * 100}%` }} />
      </div>

      <div className="flex items-end justify-between gap-3 rounded-xl bg-success/10 px-4 py-3">
        <span className="flex flex-col">
          <span className="text-sm font-medium">Sobrou neste serviço</span>
          <span className="text-xs text-muted-foreground">Margem de {margin}%</span>
        </span>
        <span className="font-heading text-2xl font-extrabold text-success tabular-nums">{formatCents(resultCents)}</span>
      </div>
      <p className="text-center text-xs text-muted-foreground">Exemplo com valores fictícios.</p>
    </figure>
  );
}
