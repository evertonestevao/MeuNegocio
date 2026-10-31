import { sampleFinance, sampleFunnel } from "@/features/marketing/content";
import { formatCents } from "@/lib/money";

/**
 * Gráficos de exemplo da página inicial, com dados fictícios e avisados como tal. Sem biblioteca:
 * a página é renderizada no servidor e não precisa de JavaScript para desenhar.
 */

const reais = (value: number) => formatCents(value * 100);

function Tooltip({ children }: { children: React.ReactNode }) {
  return (
    <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden w-max -translate-x-1/2 rounded-md border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md group-hover:block group-focus:block">
      {children}
    </span>
  );
}

function RevenueChart() {
  const { months } = sampleFinance;
  const top = Math.max(...months.flatMap((month) => [month.revenue, month.expense]));
  const last = months[months.length - 1];
  return (
    <figure className="flex min-w-0 flex-col gap-4 rounded-xl border bg-card p-5 lg:col-span-2">
      <figcaption className="flex flex-wrap items-start justify-between gap-3">
        <span>
          <span className="block text-sm text-muted-foreground">Saldo de {last.label.toLowerCase()}</span>
          <span className="block text-3xl font-semibold tracking-tight tabular-nums">{reais(last.revenue - last.expense)}</span>
        </span>
        <span className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-chart-revenue" aria-hidden />Faturamento</span>
          <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-chart-expense" aria-hidden />Gastos</span>
        </span>
      </figcaption>
      <div className="flex min-h-52 flex-1 items-end gap-2 border-b sm:gap-4" role="img" aria-label="Faturamento e gastos dos últimos 6 meses, com o faturamento acima dos gastos em todos os meses. A tabela abaixo traz os valores.">
        {months.map((month) => (

          <div key={month.label} tabIndex={0} className="group relative flex h-full min-h-52 flex-1 items-end justify-center gap-0.5 rounded-t outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring">
            <span className="lp-grow-y w-full max-w-6 rounded-t bg-chart-revenue" style={{ height: `${(month.revenue / top) * 100}%` }} />
            <span className="lp-grow-y w-full max-w-6 rounded-t bg-chart-expense" style={{ height: `${(month.expense / top) * 100}%` }} />
            <Tooltip>
              <strong className="font-medium">{month.label}</strong>: faturou {reais(month.revenue)} e gastou {reais(month.expense)}
            </Tooltip>
          </div>
        ))}
      </div>
      <div className="-mt-2 flex gap-2 text-center text-xs text-muted-foreground sm:gap-4" aria-hidden>
        {months.map((month) => (
          <span key={month.label} className="flex-1">{month.label.slice(0, 3)}</span>
        ))}
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground">Ver valores em tabela</summary>
        <table className="mt-2 w-full text-left tabular-nums">
          <thead className="text-muted-foreground">
            <tr><th className="py-1 font-medium">Mês</th><th className="py-1 font-medium">Faturamento</th><th className="py-1 font-medium">Gastos</th></tr>
          </thead>
          <tbody>
            {months.map((month) => (
              <tr key={month.label} className="border-t"><td className="py-1">{month.label}</td><td className="py-1">{reais(month.revenue)}</td><td className="py-1">{reais(month.expense)}</td></tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

function HorizontalBars({ title, rows, format }: { title: string; rows: { label: string; value: number }[]; format: (value: number) => string }) {
  const top = Math.max(...rows.map((row) => row.value));
  return (
    <figure className="flex min-w-0 flex-col gap-4 rounded-xl border bg-card p-5">
      <figcaption className="font-medium">{title}</figcaption>
      <dl className="flex flex-col gap-3 text-sm">
        {rows.map((row) => (
          <div key={row.label} className="flex flex-col gap-1">
            <div className="flex justify-between gap-3">
              <dt>{row.label}</dt>
              <dd className="font-medium tabular-nums">{format(row.value)}</dd>
            </div>
            <div className="h-2 rounded-full bg-muted" aria-hidden>
              <div className="lp-grow-x h-full rounded-full bg-chart-revenue" style={{ width: `${(row.value / top) * 100}%` }} />
            </div>
          </div>
        ))}
      </dl>
    </figure>
  );
}

export function SampleCharts() {
  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-3">
      <RevenueChart />
      <div className="flex min-w-0 flex-col gap-4">
        <HorizontalBars title="Gastos por categoria" rows={sampleFinance.categories} format={reais} />
        <HorizontalBars title="Caminho dos orçamentos" rows={sampleFunnel} format={String} />
      </div>
    </div>
  );
}
