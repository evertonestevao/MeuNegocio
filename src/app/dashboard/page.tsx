import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays, CalendarPlus, Plus, Send, Scale, Wallet } from "lucide-react";
import { BarChartCard } from "@/components/charts/bar-chart-card";
import { MetricCard } from "@/components/metric-card";
import { ROLE_LABEL } from "@/config/roles";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QUOTE_STATUS_LABEL, QUOTE_STATUS_VARIANT, formatQuoteNumber } from "@/features/quotes/status";
import { VisitRow } from "@/features/visits/components/visit-row";
import { formatLongDay, formatMonth } from "@/lib/calendar";
import { addDays, formatDate, greetingFor, todayInTimezone } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { getFinanceService } from "@/server/home";
import { getCompanyProfileService } from "@/server/quotes";
import { getActiveTenant } from "@/server/tenant";
import type { QuoteListItem } from "@/types/database";

export const metadata: Metadata = { title: "Início" };

const WEEKDAY_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function daysSince(timestamp: string | null, today: string): number | null {
  if (!timestamp) return null;
  const milliseconds = new Date(`${today}T12:00:00Z`).getTime() - new Date(timestamp).getTime();
  return Math.max(0, Math.floor(milliseconds / 86_400_000));
}

function QuoteRow({ quote, today }: { quote: QuoteListItem; today: string }) {
  const days = daysSince(quote.sent_at, today);
  const note =
    quote.status === "approved"
      ? "aprovado, falta fechar"
      : days === null
        ? "aguardando resposta"
        : days === 0
          ? "enviado hoje"
          : days === 1 ? "enviado há 1 dia" : `enviado há ${days} dias`;
  return (
    <li>
      <Link href={`/dashboard/quotes/${quote.id}`} className="flex flex-col gap-2 py-3 text-sm hover:bg-muted/50">
        <span className="flex min-w-0 flex-col">
          <span className="font-medium break-words">
            #{formatQuoteNumber(quote.number)} · {quote.title ?? "Sem título"}
          </span>
          <span className="text-muted-foreground">
            {quote.client_name ?? "Sem cliente"} · {note}
          </span>
        </span>
        <span className="flex items-center justify-between gap-3">
          <Badge variant={QUOTE_STATUS_VARIANT[quote.status]}>{QUOTE_STATUS_LABEL[quote.status]}</Badge>
          <span className="text-base font-semibold tabular-nums">{formatCents(quote.total_cents)}</span>
        </span>
      </Link>
    </li>
  );
}

function MonthBar({ label, cents, max, barClass }: { label: string; cents: number; max: number; barClass: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between gap-3">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold tabular-nums">{formatCents(cents)}</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${barClass}`} style={{ width: max > 0 ? `${Math.round((cents / max) * 100)}%` : "0%" }} />
      </div>
    </div>
  );
}

export default async function DashboardPage() {
  const { active } = await getActiveTenant();
  if (!active) return null; // layout já redirecionou
  // O técnico não usa o painel do escritório: entra direto nas próprias visitas.
  if (active.role === "technician") redirect("/dashboard/my-visits");

  const profile = await (await getCompanyProfileService()).get(active.id);
  const today = todayInTimezone(profile.timezone);
  const home = await (await getFinanceService()).getHome({ companyId: active.id, role: active.role }, today);
  const { finance, forecast } = home;
  const openQuotes = [...home.awaitingClose, ...home.awaitingReply];
  const nextVisit = home.today.find((visit) => visit.status === "scheduled" || visit.status === "in_progress");
  const monthMax = finance ? Math.max(finance.monthRevenueCents, finance.monthExpenseCents) : 0;
  const weekData = home.week.map((day, index) => ({
    dia: index === 0 ? "Hoje" : WEEKDAY_SHORT[new Date(`${day.date}T12:00:00Z`).getUTCDay()],
    execucao: day.execution,
    tecnica: day.assessment,
  }));
  const weekTotal = home.week.reduce((total, day) => total + day.execution + day.assessment, 0);
  const trendData = (finance?.trend ?? []).map((item) => ({
    mes: formatMonth(item.month).slice(0, 3),
    faturamento: item.revenueCents / 100,
    gastos: item.expenseCents / 100,
  }));
  const monthName = formatMonth(today).split(" ")[0].toLowerCase();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3 max-sm:[&>*]:w-full">
        <div className="min-w-0">
          <h2 className="font-heading text-3xl font-extrabold tracking-tight">{greetingFor(profile.timezone)}</h2>
          <p className="text-sm text-muted-foreground first-letter:uppercase">
            {formatLongDay(today)} · <span className="break-words">{active.name}</span> · {ROLE_LABEL[active.role]}
          </p>
        </div>
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
          <Button variant="outline" render={<Link href="/dashboard/schedule?new=1" />} nativeButton={false}>
            <CalendarPlus className="size-4" /> Nova visita
          </Button>
          <Button render={<Link href="/dashboard/quotes/new" />} nativeButton={false}>
            <Plus className="size-4" /> Novo orçamento
          </Button>
        </div>
      </div>

      <div className={`grid grid-cols-2 gap-3 sm:gap-4 ${finance ? "lg:grid-cols-4" : ""}`}>
        <MetricCard
          icon={CalendarDays}
          tone="info"
          label="Visitas hoje"
          value={home.today.length}
          hint={nextVisit ? `Próxima às ${nextVisit.starts_at.slice(0, 5)} — ${nextVisit.client_name}` : "Nenhuma visita pendente hoje"}
        />
        <MetricCard
          icon={Send}
          tone="warning"
          label="Em negociação"
          value={formatCents(forecast.sentCents)}
          hint={`${home.awaitingReply.length === 1 ? "1 enviado" : `${home.awaitingReply.length} enviados`} · ${formatCents(forecast.approvedCents)} a fechar`}
        />
        {finance ? (
          <>
            <MetricCard
              icon={Scale}
              tone={finance.balanceCents < 0 ? "danger" : "success"}
              toneValue
              label={`Saldo de ${monthName}`}
              value={formatCents(finance.balanceCents)}
              hint={`Faturou ${formatCents(finance.monthRevenueCents)} · gastou ${formatCents(finance.monthExpenseCents)}`}
            />
            <MetricCard
              icon={Wallet}
              tone={finance.dueSoonCents > 0 ? "warning" : "success"}
              label="A pagar em 7 dias"
              value={formatCents(finance.dueSoonCents)}
              hint={finance.dueSoonCount === 0 ? "Nenhuma conta nos próximos dias." : finance.dueSoonCount === 1 ? "1 conta" : `${finance.dueSoonCount} contas`}
            />
          </>
        ) : null}
      </div>

      <div className={`grid items-start gap-4 ${finance ? "lg:grid-cols-2" : ""}`}>
        <BarChartCard
          title="Agenda dos próximos 7 dias"
          description={weekTotal === 1 ? "1 visita marcada" : `${weekTotal} visitas marcadas`}
          data={weekData}
          xKey="dia"
          series={[
            { key: "execucao", label: "Execução" },
            { key: "tecnica", label: "Visita técnica" },
          ]}
          integerValues
          yAxisWidth={28}
          height={200}
        />
        {finance ? (
          <BarChartCard
            title="Faturamento e gastos"
            description="Últimos 6 meses. Faturamento conta só orçamentos fechados."
            data={trendData}
            xKey="mes"
            series={[
              { key: "faturamento", label: "Faturamento" },
              { key: "gastos", label: "Gastos" },
            ]}
            valueFormat={{ style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 }}
            yAxisWidth={64}
            height={200}
          />
        ) : null}
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2"><CalendarDays className="size-4 text-info" /> Hoje</CardTitle>
            <Link href="/dashboard/schedule" className="shrink-0 whitespace-nowrap text-sm font-medium text-primary hover:underline">
              Ver agenda
            </Link>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {home.today.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma visita hoje.</p>
            ) : (
              <div className="flex flex-col divide-y">
                {home.today.map((visit) => (
                  <VisitRow key={visit.id} visit={visit} />
                ))}
              </div>
            )}
            <h3 className="border-t pt-3 text-sm font-medium text-muted-foreground">
              Amanhã · {formatDate(addDays(today, 1)).slice(0, 5)}
            </h3>
            {home.tomorrow.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma visita amanhã.</p>
            ) : (
              <div className="flex flex-col divide-y">
                {home.tomorrow.map((visit) => (
                  <VisitRow key={visit.id} visit={visit} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2"><Send className="size-4 text-warning" /> Orçamentos em andamento</CardTitle>
              <Link href="/dashboard/quotes" className="shrink-0 whitespace-nowrap text-sm font-medium text-primary hover:underline">
                Ver todos
              </Link>
            </CardHeader>
            <CardContent>
              {openQuotes.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum orçamento esperando resposta ou fechamento.</p>
              ) : (
                <ul className="flex flex-col divide-y">
                  {openQuotes.map((quote) => (
                    <QuoteRow key={quote.id} quote={quote} today={today} />
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {finance ? (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <CardTitle className="first-letter:uppercase">{formatMonth(today)}</CardTitle>
                <Link href="/dashboard/finance" className="shrink-0 whitespace-nowrap text-sm font-medium text-primary hover:underline">
                  Ver financeiro
                </Link>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 text-sm">
                <MonthBar label="Faturamento" cents={finance.monthRevenueCents} max={monthMax} barClass="bg-chart-revenue" />
                <MonthBar label="Gastos" cents={finance.monthExpenseCents} max={monthMax} barClass="bg-chart-expense" />
                <div className="flex items-baseline justify-between gap-3 border-t pt-3">
                  <span className="font-medium">Saldo do mês</span>
                  <strong className={`font-heading text-2xl font-extrabold tabular-nums ${finance.balanceCents < 0 ? "text-destructive" : "text-success"}`}>
                    {formatCents(finance.balanceCents)}
                  </strong>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {finance ? (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2"><Wallet className="size-4 text-destructive" /> A pagar hoje</CardTitle>
                <Link href="/dashboard/expenses" className="shrink-0 whitespace-nowrap text-sm font-medium text-primary hover:underline">
                  Ver gastos
                </Link>
              </CardHeader>
              <CardContent>
                {finance.dueToday.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum gasto com vencimento para hoje.</p>
                ) : (
                  <ul className="flex flex-col divide-y text-sm">
                    {finance.dueToday.map((expense) => (
                      <li key={expense.id} className="flex justify-between gap-3 py-2">
                        <span className="min-w-0 break-words">{expense.description}</span>
                        <span className="shrink-0 font-medium tabular-nums">{formatCents(expense.amount_cents)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
