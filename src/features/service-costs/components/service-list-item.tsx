import Link from "next/link";
import { AlertTriangle, CalendarClock, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { NewExpenseButton, type ExpenseFormOptions } from "@/features/expenses/components/expense-forms";
import { CloseQuoteButton } from "@/features/quotes/components/close-quote-button";
import { formatQuoteNumber } from "@/features/quotes/status";
import { formatDate } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import type { ServiceListItem } from "@/services/serviceCostService";

const ALERT_TEXT = {
  loss: "Os custos já passaram do valor cobrado.",
  over_budget: "Os custos já passaram do previsto no orçamento.",
  low_margin: "A margem está abaixo da meta da empresa.",
} as const;

const WEEKDAY = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function nextVisitLabel(item: ServiceListItem, today: string): string | null {
  const next = item.nextVisit;
  if (!next) return null;
  const day = next.visit_date === today ? "Hoje" : `${WEEKDAY[new Date(`${next.visit_date}T12:00:00Z`).getUTCDay()]}, ${formatDate(next.visit_date).slice(0, 5)}`;
  return `${day} às ${next.starts_at.slice(0, 5)}`;
}

/** Um serviço na lista: andamento das visitas e, para quem vê o financeiro, custos e resultado. */
export function ServiceListItemCard({
  item,
  stage,
  today,
  canClose,
  expenseOptions,
}: {
  item: ServiceListItem;
  stage: "open" | "done";
  today: string;
  canClose: boolean;
  expenseOptions: ExpenseFormOptions | null;
}) {
  const { quote, cost } = item;
  const next = nextVisitLabel(item, today);
  const resultTone = cost?.status === "loss" ? "text-destructive" : cost?.status === "low" ? "text-warning" : "text-success";

  return (
    <Card className="gap-0 py-0">
      <CardContent className="flex flex-col gap-3 px-4 py-4">
        <Link href={`/dashboard/quotes/${quote.id}`} className="group flex items-start justify-between gap-3">
          <span className="flex min-w-0 flex-col">
            <span className="font-heading font-bold break-words group-hover:underline">
              #{formatQuoteNumber(quote.number)} · {quote.title ?? "Sem título"}
            </span>
            <span className="text-sm text-muted-foreground">{quote.client_name ?? "Sem cliente"}</span>
          </span>
          <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground" aria-hidden />
        </Link>

        <div className="flex flex-wrap items-center gap-1.5">
          {stage === "done" ? (
            <Badge variant="success">Concluído{quote.closed_at ? ` em ${formatDate(quote.closed_at.slice(0, 10))}` : ""}</Badge>
          ) : item.inProgress ? (
            <Badge variant="warning">Em execução</Badge>
          ) : null}
          <Badge variant="outline">
            {item.visitsTotal === 0 ? "Sem visitas" : `${item.visitsDone} de ${item.visitsTotal} ${item.visitsTotal === 1 ? "visita feita" : "visitas feitas"}`}
          </Badge>
          {stage === "open" ? (
            next ? (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <CalendarClock className="size-3.5" aria-hidden /> Próxima: {next}
              </span>
            ) : (
              <Link href={`/dashboard/schedule?new=1&quote=${quote.id}`} className="text-xs font-medium text-primary hover:underline">
                Agendar visita
              </Link>
            )
          ) : null}
        </div>

        {cost ? (
          <dl className="grid grid-cols-3 gap-2 rounded-xl bg-muted/60 p-3 text-xs">
            <div className="flex min-w-0 flex-col gap-0.5">
              <dt className="text-muted-foreground">Cobrado</dt>
              <dd className="font-semibold tabular-nums">{formatCents(cost.revenueCents)}</dd>
            </div>
            <div className="flex min-w-0 flex-col gap-0.5">
              <dt className="text-muted-foreground">Custos</dt>
              <dd className="font-semibold tabular-nums">{formatCents(cost.totalCostCents)}</dd>
            </div>
            <div className="flex min-w-0 flex-col gap-0.5">
              <dt className="text-muted-foreground">Resultado</dt>
              {cost.totalCostCents === 0 ? (
                // Sem custo lançado, "margem 100%" engana: ainda não há o que comparar.
                <dd className="text-muted-foreground">Sem custos lançados</dd>
              ) : (
                <dd className={`font-semibold tabular-nums ${resultTone}`}>
                  {formatCents(cost.resultCents)}
                  {cost.marginPercent !== null ? <span className="block font-normal text-muted-foreground">margem {cost.marginPercent}%</span> : null}
                </dd>
              )}
            </div>
          </dl>
        ) : null}

        {item.alert ? (
          <p className="flex items-start gap-2 rounded-lg bg-warning/10 px-3 py-2 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
            {ALERT_TEXT[item.alert]}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2 max-sm:[&>*]:flex-1">
          {expenseOptions ? (
            <NewExpenseButton options={expenseOptions} defaultDate={today} defaultQuoteId={quote.id} label="Lançar gasto" variant="outline" />
          ) : null}
          {stage === "open" && canClose ? <CloseQuoteButton quoteId={quote.id} totalCents={quote.total_cents} today={today} label="Concluir e faturar" /> : null}
          {!expenseOptions && !(stage === "open" && canClose) ? (
            <Button variant="outline" nativeButton={false} render={<Link href={`/dashboard/quotes/${quote.id}`} />}>
              Abrir serviço
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
