import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, ChevronRight, Scale, TrendingDown, TrendingUp } from "lucide-react";
import { BarChartCard } from "@/components/charts/bar-chart-card";
import { MetricCard } from "@/components/metric-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EXPENSE_KIND_LABEL } from "@/features/expenses/schemas";
import { formatQuoteNumber } from "@/features/quotes/status";
import { addMonths, formatMonth, isValidDate } from "@/lib/calendar";
import { formatDate, todayInTimezone } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { getFinanceService } from "@/server/home";
import { getCompanyProfileService } from "@/server/quotes";
import { getServiceCostService } from "@/server/serviceCosts";
import { getActiveTenant } from "@/server/tenant";
import { permissionService } from "@/services/permissionService";

export const metadata: Metadata = { title: "Financeiro" };

function MonthlyRows({ series, selected, monthHref }: {
  series: { month: string; revenueCents: number; expenseCents: number }[];
  selected: string;
  monthHref: (month: string) => string;
}) {
  return (
    <ul className="flex flex-col divide-y text-sm">
      {series.toReversed().map((item) => {
        const balance = item.revenueCents - item.expenseCents;
        return (
          <li key={item.month}>
            <Link scroll={false} href={monthHref(item.month)} className="flex items-center justify-between gap-3 py-2 hover:underline">
              <span className="flex min-w-0 flex-col">
                <span className={item.month === selected ? "font-semibold" : undefined}>{formatMonth(item.month)}</span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  Faturamento {formatCents(item.revenueCents)} · gastos {formatCents(item.expenseCents)}
                </span>
              </span>
              <span className="flex shrink-0 flex-col items-end">
                <span className={`font-semibold tabular-nums ${balance < 0 ? "text-destructive" : "text-success"}`}>{formatCents(balance)}</span>
                <span className="text-xs text-muted-foreground">saldo</span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function changeHint(change: number | null): string {
  if (change === null) return "Sem base no mês anterior";
  return `${change > 0 ? "+" : ""}${change}% sobre o mês anterior`;
}

export default async function FinancePage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const params = await searchParams;
  const { active } = await getActiveTenant();
  if (!active) return null;
  if (!permissionService.canManageFinance(active.role)) redirect("/dashboard");

  const profile = await (await getCompanyProfileService()).get(active.id);
  const today = todayInTimezone(profile.timezone);
  const month = isValidDate(`${params.m}-01`) ? `${params.m}-01` : `${today.slice(0, 7)}-01`;
  const overview = await (await getFinanceService()).getOverview({ companyId: active.id, role: active.role }, month);
  const targetMarginPercent = profile.target_margin_percent ?? 20;
  const results = await (await getServiceCostService()).getForQuotes(
    { companyId: active.id, role: active.role },
    overview.revenues.map((revenue) => ({ id: revenue.quote_id, totalCents: revenue.amount_cents, plannedCostCents: null })),
    targetMarginPercent,
  );
  // Do maior resultado para o prejuízo: é onde o dono percebe o que vale a pena.
  const ranked = overview.revenues.toSorted((a, b) => (results.get(b.quote_id)?.resultCents ?? 0) - (results.get(a.quote_id)?.resultCents ?? 0));

  const monthHref = (target: string) => `/dashboard/finance?m=${target.slice(0, 7)}`;
  const chartData = overview.series.map((item) => ({
    mes: formatMonth(item.month).slice(0, 3),
    faturamento: item.revenueCents / 100,
    gastos: item.expenseCents / 100,
  }));
  const largestCategory = overview.categories[0]?.totalCents ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="font-heading text-2xl font-extrabold tracking-tight">Financeiro</h2>
        <p className="text-sm text-muted-foreground">Faturamento (orçamentos fechados) e gastos, lado a lado.</p>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon-sm" render={<Link scroll={false} href={monthHref(addMonths(month, -1))} aria-label="Mês anterior" />} nativeButton={false}>
          <ChevronLeft className="size-4" />
        </Button>
        <span className="min-w-36 text-center text-sm font-medium">{formatMonth(month)}</span>
        <Button variant="outline" size="icon-sm" render={<Link scroll={false} href={monthHref(addMonths(month, 1))} aria-label="Próximo mês" />} nativeButton={false}>
          <ChevronRight className="size-4" />
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        <MetricCard icon={TrendingUp} tone="info" label="Faturamento" value={formatCents(overview.revenueCents)} hint={changeHint(overview.revenueChange)} />
        <MetricCard icon={TrendingDown} tone="warning" label="Gastos" value={formatCents(overview.expenseCents)} hint={changeHint(overview.expenseChange)} />
        <div className="col-span-2 sm:col-span-1">
          <MetricCard
            icon={Scale}
            tone={overview.balanceCents < 0 ? "danger" : "success"}
            toneValue
            label="Saldo do mês"
            value={formatCents(overview.balanceCents)}
            hint={overview.revenueCents === 0 && overview.expenseCents === 0 ? "Sem movimento neste mês" : overview.balanceCents >= 0 ? "Sobrou dinheiro neste mês" : "Gastos maiores que o faturamento"}
          />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Cada coluna estica o último cartão até a altura da outra: nada de vão entre os cartões. */}
        <div className="flex min-w-0 flex-col gap-2 lg:gap-4">
          <BarChartCard
            title="Últimos 6 meses"
            data={chartData}
            xKey="mes"
            series={[
              { key: "faturamento", label: "Faturamento" },
              { key: "gastos", label: "Gastos" },
            ]}
            valueFormat={{ style: "currency", currency: "BRL", maximumFractionDigits: 0 }}
            yAxisWidth={72}
          />
          {/* No computador fica sempre à vista, ao lado das categorias; no celular, recolhido para não alongar a tela. */}
          <Card className="max-lg:hidden lg:flex-1">
            <CardHeader>
              <CardTitle>Mês a mês</CardTitle>
            </CardHeader>
            <CardContent>
              <MonthlyRows series={overview.series} selected={month} monthHref={monthHref} />
            </CardContent>
          </Card>
          <details className="rounded-xl border bg-card px-4 py-3 text-sm lg:hidden">
            <summary className="cursor-pointer font-medium">Ver mês a mês</summary>
            <div className="mt-2">
              <MonthlyRows series={overview.series} selected={month} monthHref={monthHref} />
            </div>
          </details>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Gastos por categoria</CardTitle>
            </CardHeader>
            <CardContent>
              {overview.categories.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum gasto neste mês.</p>
              ) : (
                <ul className="flex flex-col gap-3 text-sm">
                  {overview.categories.map((category) => (
                    <li key={category.categoryId} className="flex flex-col gap-1">
                      <span className="flex justify-between gap-2">
                        <span className="min-w-0 break-words">{category.name}</span>
                        <span className="shrink-0 font-medium tabular-nums">{formatCents(category.totalCents)}</span>
                      </span>
                      <span className="h-2 rounded-full bg-muted" aria-hidden>
                        <span className="block h-full rounded-full bg-chart-2" style={{ width: `${(category.totalCents / largestCategory) * 100}%` }} />
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card className="lg:flex-1">
            <CardHeader>
              <CardTitle>Previsão</CardTitle>
              <CardDescription>Ainda não entra no saldo: só vira faturamento quando o orçamento for fechado.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col gap-2 text-sm">
              <p className="flex justify-between gap-2">
                <span className="text-muted-foreground">Aprovados, a fechar</span>
                <span className="tabular-nums">{formatCents(overview.forecast.approvedCents)}</span>
              </p>
              <p className="flex justify-between gap-2">
                <span className="text-muted-foreground">Enviados, aguardando resposta</span>
                <span className="tabular-nums">{formatCents(overview.forecast.sentCents)}</span>
              </p>
              <p className="flex justify-between gap-2 border-t pt-2 font-medium">
                <span>Possível entrada</span>
                <span className="tabular-nums">{formatCents(overview.forecast.possibleCents)}</span>
              </p>
              <Link href="/dashboard/quotes" className="w-fit font-medium text-primary hover:underline">
                Ver orçamentos
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Resultado por serviço</CardTitle>
            <CardDescription>Serviços fechados no mês, descontados os gastos ligados, as horas da equipe e o imposto estimado. Meta de margem: {targetMarginPercent}%.</CardDescription>
          </CardHeader>
          <CardContent>
            {overview.revenues.length === 0 ? (
              <p className="text-sm text-muted-foreground">Feche um orçamento aprovado para lançar o faturamento.</p>
            ) : (
              <ul className="flex flex-col divide-y text-sm">
                {ranked.map((revenue) => {
                  const result = results.get(revenue.quote_id);
                  const tone = result?.status === "loss" ? "text-destructive" : result?.status === "low" ? "text-warning" : "text-success";
                  return (
                  <li key={revenue.id}>
                    <Link href={`/dashboard/quotes/${revenue.quote_id}`} className="flex items-center justify-between gap-3 py-2 hover:underline">
                      <span className="flex min-w-0 flex-col">
                        <span className="break-words">
                          #{formatQuoteNumber(revenue.quote_number)} · {revenue.quote_title ?? "Sem título"}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatDate(revenue.competence_date)} · {revenue.client_name} · cobrado {formatCents(revenue.amount_cents)}
                        </span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end">
                        <span className={`font-semibold tabular-nums ${tone}`}>{formatCents(result?.resultCents ?? revenue.amount_cents)}</span>
                        <span className="text-xs text-muted-foreground">{result?.marginPercent === null || result === undefined ? "" : `margem ${result.marginPercent}%`}</span>
                      </span>
                    </Link>
                  </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
            <CardTitle>Lançamentos de gasto</CardTitle>
            <Link href={`/dashboard/expenses?m=${month.slice(0, 7)}&view=list`} className="shrink-0 whitespace-nowrap text-sm font-medium text-primary hover:underline">
              Gerenciar gastos
            </Link>
          </CardHeader>
          <CardContent>
            {overview.expenses.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum gasto neste mês.</p>
            ) : (
              <ul className="flex flex-col divide-y text-sm">
                {overview.expenses.map((expense) => (
                  <li key={expense.id} className="flex items-center justify-between gap-3 py-2">
                    <span className="flex min-w-0 flex-col">
                      <span className="break-words">{expense.description}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(expense.expense_date)} · {expense.category_name} · {EXPENSE_KIND_LABEL[expense.kind]}
                      </span>
                    </span>
                    <span className="shrink-0 font-medium tabular-nums">{formatCents(expense.amount_cents)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
