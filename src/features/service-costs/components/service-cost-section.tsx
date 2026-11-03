import { Clock, PiggyBank, Receipt, Wallet } from "lucide-react";
import { MetricCard, type MetricTone } from "@/components/metric-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DeleteExpenseButton,
  EditExpenseButton,
  NewExpenseButton,
  type ExpenseFormOptions,
} from "@/features/expenses/components/expense-forms";
import { PAYMENT_METHOD_LABEL } from "@/features/expenses/schemas";
import { formatDate } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import type { MarginStatus, ServiceCost } from "@/services/serviceCostService";
import { formatHours, type ServiceCostPdfInput } from "../pdf";
import { ServiceCostPdfButton } from "./service-cost-pdf-button";

const RESULT_TONE: Record<MarginStatus, MetricTone> = { good: "success", low: "warning", loss: "danger", none: "info" };

function marginHint(cost: ServiceCost, target: number): string {
  if (cost.marginPercent === null) return "Sem valor cobrado";
  if (cost.status === "loss") return `Prejuízo · margem ${cost.marginPercent}%`;
  if (cost.status === "low") return `Margem ${cost.marginPercent}%, abaixo da meta de ${target}%`;
  return `Margem ${cost.marginPercent}% · meta ${target}%`;
}

/** Custos e resultado do serviço, na página do orçamento aprovado ou fechado. Só owner e admin. */
export function ServiceCostSection({
  quoteId,
  cost,
  targetMarginPercent,
  expenseOptions,
  today,
  pdf,
}: {
  quoteId: string;
  cost: ServiceCost;
  targetMarginPercent: number;
  expenseOptions: ExpenseFormOptions;
  today: string;
  pdf: ServiceCostPdfInput;
}) {
  const largest = cost.categories[0]?.totalCents ?? 0;
  const difference = cost.plannedCostCents === null ? null : cost.totalCostCents - cost.plannedCostCents;

  return (
    <section className="flex flex-col gap-4" aria-labelledby="service-cost-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 id="service-cost-title" className="font-heading text-xl font-extrabold tracking-tight">
            Custos e resultado do serviço
          </h3>
          <p className="text-sm text-muted-foreground">Gastos ligados a este orçamento e horas da equipe nas visitas dele. Só você e o administrador veem.</p>
        </div>
        <div className="flex flex-wrap gap-2 max-sm:w-full max-sm:[&>*]:flex-1">
          <NewExpenseButton options={expenseOptions} defaultDate={today} defaultQuoteId={quoteId} label="Lançar gasto" />
          <ServiceCostPdfButton input={pdf} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        <MetricCard icon={Receipt} tone="info" label="Valor cobrado" value={formatCents(cost.revenueCents)} hint="Total do orçamento" />
        <MetricCard
          icon={Wallet}
          tone="warning"
          label="Custos"
          value={formatCents(cost.totalCostCents)}
          hint={`Gastos ${formatCents(cost.expenseCents)} · horas ${formatCents(cost.laborCents)}`}
        />
        <div className="col-span-2 sm:col-span-1">
          <MetricCard
            icon={PiggyBank}
            tone={RESULT_TONE[cost.status]}
            toneValue
            label="Resultado"
            value={formatCents(cost.resultCents)}
            hint={marginHint(cost, targetMarginPercent)}
          />
        </div>
      </div>

      {difference !== null ? (
        <p className="rounded-lg bg-muted px-3 py-2 text-sm">
          Previsto no orçamento: <strong className="tabular-nums">{formatCents(cost.plannedCostCents!)}</strong>. Realizado:{" "}
          <strong className="tabular-nums">{formatCents(cost.totalCostCents)}</strong>{" "}
          <span className={difference > 0 ? "text-destructive" : "text-success"}>
            ({difference > 0 ? `${formatCents(difference)} acima` : difference < 0 ? `${formatCents(-difference)} abaixo` : "igual"} do previsto)
          </span>
        </p>
      ) : null}
      {cost.laborWithoutRate ? (
        <p className="rounded-lg bg-warning/10 px-3 py-2 text-sm">
          Há horas de pessoas sem custo por hora cadastrado em Equipe. O resultado pode estar maior do que o real.
        </p>
      ) : null}

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Custos por categoria</CardTitle>
          </CardHeader>
          <CardContent>
            {cost.categories.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum custo ainda. Lance os gastos do serviço e as horas da equipe entram sozinhas.</p>
            ) : (
              <ul className="flex flex-col gap-3 text-sm">
                {cost.categories.map((category) => (
                  <li key={category.categoryId} className="flex flex-col gap-1.5">
                    <div className="flex justify-between gap-3">
                      <span>{category.name}</span>
                      <span className="font-semibold tabular-nums">{formatCents(category.totalCents)}</span>
                    </div>
                    <span className="h-2.5 overflow-hidden rounded-full bg-muted">
                      <span
                        className={`block h-full rounded-full ${category.categoryId === "labor" ? "bg-chart-1" : "bg-chart-2"}`}
                        style={{ width: `${largest ? Math.round((category.totalCents / largest) * 100) : 0}%` }}
                      />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="size-4 text-info" /> Mão de obra
            </CardTitle>
            <CardDescription>Horas lançadas nas visitas deste orçamento, pelo custo por hora de cada pessoa.</CardDescription>
          </CardHeader>
          <CardContent>
            {cost.labor.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma hora lançada nas visitas deste orçamento.</p>
            ) : (
              <ul className="flex flex-col divide-y text-sm">
                {cost.labor.map((line) => (
                  <li key={line.employeeId} className="flex justify-between gap-3 py-2">
                    <span className="flex min-w-0 flex-col">
                      <span className="font-medium">{line.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatHours(line.minutes)} × {line.rateCents ? formatCents(line.rateCents) : "sem custo por hora"}
                      </span>
                    </span>
                    <span className="shrink-0 font-semibold tabular-nums">{formatCents(line.costCents)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Gastos lançados</CardTitle>
          <CardDescription>Também entram no caixa do mês, em Gastos e no Financeiro.</CardDescription>
        </CardHeader>
        <CardContent>
          {cost.expenses.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum gasto ligado a este serviço.</p>
          ) : (
            <ul className="flex flex-col divide-y text-sm">
              {cost.expenses.map((expense) => (
                <li key={expense.id} className="flex items-center justify-between gap-2 py-3 first:pt-0 last:pb-0">
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="font-medium break-words">{expense.description}</span>
                    <span className="text-xs text-muted-foreground">
                      {[
                        formatDate(expense.expense_date),
                        expense.category_name,
                        expense.supplier,
                        expense.payment_method ? PAYMENT_METHOD_LABEL[expense.payment_method] : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="font-semibold tabular-nums">{formatCents(expense.amount_cents)}</span>
                    <EditExpenseButton expense={expense} options={expenseOptions} />
                    <DeleteExpenseButton expense={expense} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
