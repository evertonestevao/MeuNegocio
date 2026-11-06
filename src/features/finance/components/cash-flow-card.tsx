import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import type { CashFlow } from "@/services/financeService";

const signed = (cents: number) => `${cents > 0 ? "+" : cents < 0 ? "−" : ""}${formatCents(Math.abs(cents))}`;
const tone = (cents: number) => (cents < 0 ? "text-destructive" : cents > 0 ? "text-success" : "text-muted-foreground");
const short = (date: string) => formatDate(date).slice(0, 5);

/** Vai dar para pagar as contas? O que entra e o que sai em cada uma das próximas semanas. */
export function CashFlowCard({ flow }: { flow: CashFlow }) {
  const tightest = flow.weeks.reduce((worst, week) => (week.cumulativeCents < worst.cumulativeCents ? week : worst), flow.weeks[0]);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Próximas {flow.weeks.length} semanas</CardTitle>
        <CardDescription>
          Entra o que vence das parcelas a receber, já sem a taxa do cartão; sai o que está lançado e as contas recorrentes. Não conta o dinheiro que você já tem no banco.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        <ul className="flex flex-col divide-y">
          <li className="hidden grid-cols-[1fr_repeat(4,8rem)] gap-3 pb-2 text-xs font-medium text-muted-foreground sm:grid">
            <span>Semana</span>
            <span className="text-right">Entra</span>
            <span className="text-right">Sai</span>
            <span className="text-right">Na semana</span>
            <span className="text-right">Acumulado</span>
          </li>
          {flow.weeks.map((week) => (
            <li key={week.start} className="grid grid-cols-3 gap-x-3 gap-y-1 py-2.5 sm:grid-cols-[1fr_repeat(4,8rem)] sm:items-center">
              <span className="col-span-3 font-medium sm:col-span-1">
                {short(week.start)} a {short(week.end)}
              </span>
              <span className="flex flex-col sm:block sm:text-right">
                <span className="text-xs text-muted-foreground sm:hidden">Entra</span>
                <span className="tabular-nums text-success">{formatCents(week.inCents)}</span>
              </span>
              <span className="flex flex-col sm:block sm:text-right">
                <span className="text-xs text-muted-foreground sm:hidden">Sai</span>
                <span className="tabular-nums text-destructive">{formatCents(week.outCents)}</span>
              </span>
              <span className="flex flex-col sm:block sm:text-right">
                <span className="text-xs text-muted-foreground sm:hidden">Na semana</span>
                <span className={`font-semibold tabular-nums ${tone(week.netCents)}`}>{signed(week.netCents)}</span>
              </span>
              <span className="hidden text-right tabular-nums sm:block">
                <span className={tone(week.cumulativeCents)}>{signed(week.cumulativeCents)}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="flex flex-wrap justify-between gap-2 rounded-lg bg-muted px-3 py-2">
          <span>
            Em {flow.weeks.length} semanas: entra {formatCents(flow.inCents)}, sai {formatCents(flow.outCents)}
          </span>
          <strong className={`tabular-nums ${tone(flow.inCents - flow.outCents)}`}>{signed(flow.inCents - flow.outCents)}</strong>
        </p>
        {tightest && tightest.cumulativeCents < 0 ? (
          <p className="rounded-lg bg-destructive/10 px-3 py-2">
            Até {formatDate(tightest.end)}, sai {formatCents(-tightest.cumulativeCents)} a mais do que entra. Confira se o saldo do banco cobre a diferença.
            {flow.overdueCents > 0 ? ` Receber os ${formatCents(flow.overdueCents)} atrasados também ajuda.` : ""}
          </p>
        ) : null}
        {flow.overdueCents > 0 && !(tightest && tightest.cumulativeCents < 0) ? (
          <p className="text-muted-foreground">Fora da conta: {formatCents(flow.overdueCents)} atrasados, que entram quando forem cobrados.</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
