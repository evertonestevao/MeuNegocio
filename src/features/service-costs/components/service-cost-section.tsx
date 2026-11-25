import { Clock, PiggyBank, Receipt, Wallet } from "lucide-react";
import { TAX_UI_ENABLED } from "@/config/features";
import { MetricCard, type MetricTone } from "@/components/metric-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NewExpenseButton, type ExpenseFormOptions } from "@/features/expenses/components/expense-forms";
import { formatCents } from "@/lib/money";
import { groupExpensesByCategory } from "@/services/expenseService";
import type { MarginStatus, ServiceCost } from "@/services/serviceCostService";
import { formatHours, type ServiceCostPdfInput } from "../pdf";
import { ServiceCostPdfButton } from "./service-cost-pdf-button";
import { ServiceExpenseList } from "./service-expense-list";
import { ServiceTaxForm } from "./service-tax-form";
import { allCostsCents, costsLabel, marginHint } from "../labels";

const RESULT_TONE: Record<MarginStatus, MetricTone> = { good: "success", low: "warning", loss: "danger", none: "info" };

/** Custos e resultado do serviço, na página do orçamento aprovado ou fechado. Só owner e admin. */
export function ServiceCostSection({
  quoteId,
  cost,
  coverage,
  targetMarginPercent,
  expenseOptions,
  today,
  pdf,
}: {
  quoteId: string;
  cost: ServiceCost;
  /** Quantos itens têm custo informado, de quantos ao todo. */
  coverage: { withCost: number; total: number };
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
          <p className="text-sm text-muted-foreground">
            Só você e o administrador veem — isto não vai para o cliente. Mostra quanto você cobra, quanto gasta e quanto sobra. Começa como estimativa do orçamento e vira o número real conforme você lança os gastos e as horas da equipe{TAX_UI_ENABLED ? " (e o imposto)" : ""}.
          </p>
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
          label={costsLabel(cost)}
          value={formatCents(allCostsCents(cost))}
          hint={`Gastos ${formatCents(cost.expenseCents)} · horas ${formatCents(cost.laborCents)}${cost.taxCents > 0 ? ` · imposto ${formatCents(cost.taxCents)}` : ""}${cost.cardFeeCents > 0 ? ` · taxa do cartão ${formatCents(cost.cardFeeCents)}` : ""}${cost.anticipationCents > 0 ? ` · antecipação ${formatCents(cost.anticipationCents)}` : ""}`}
        />
        <div className="col-span-2 sm:col-span-1">
          <MetricCard
            icon={PiggyBank}
            tone={RESULT_TONE[cost.status]}
            toneValue
            label="Quanto sobra"
            value={formatCents(cost.resultCents)}
            hint={marginHint(cost, targetMarginPercent)}
          />
        </div>
      </div>

      {coverage.total > 0 && coverage.withCost < coverage.total ? (
        <p className="rounded-lg bg-warning/10 px-3 py-2 text-sm">
          Custo informado em <strong>{coverage.withCost}</strong> de <strong>{coverage.total}</strong> itens. Os {coverage.total - coverage.withCost} sem custo contam como R$ 0 na estimativa, então a margem prevista pode estar otimista. Informe o custo de cada item no orçamento ou no catálogo.
        </p>
      ) : null}

      {TAX_UI_ENABLED ? (
        <ServiceTaxForm quoteId={quoteId} rateBps={cost.taxRateBps} taxCents={cost.taxCents} source={cost.taxSource} />
      ) : null}

      {difference !== null ? (
        <p className="rounded-lg bg-muted px-3 py-2 text-sm">
          Você estimou gastar <strong className="tabular-nums">{formatCents(cost.plannedCostCents!)}</strong> e até agora lançou{" "}
          <strong className="tabular-nums">{formatCents(cost.totalCostCents)}</strong>{" "}
          <span className={difference > 0 ? "text-destructive" : "text-success"}>
            ({difference > 0 ? `${formatCents(difference)} a mais` : difference < 0 ? `${formatCents(-difference)} a menos` : "igual"} que a estimativa)
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
              <p className="text-sm text-muted-foreground">Nenhum custo ainda. Lance os gastos do serviço; as horas da equipe{TAX_UI_ENABLED ? " e o imposto" : ""} entram sozinhos.</p>
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
                        className={`block h-full rounded-full ${category.categoryId === "labor" ? "bg-chart-1" : category.categoryId === "tax" || category.categoryId === "card_fee" || category.categoryId === "anticipation" ? "bg-chart-3" : "bg-chart-2"}`}
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
            <ServiceExpenseList expenses={cost.expenses} groups={groupExpensesByCategory(cost.expenses)} options={expenseOptions} />
          )}
        </CardContent>
      </Card>
    </section>
  );
}
