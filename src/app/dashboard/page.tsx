import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays, Send, Scale, Wallet } from "lucide-react";
import { MetricCard } from "@/components/metric-card";
import { ROLE_LABEL } from "@/config/roles";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QUOTE_STATUS_LABEL, formatQuoteNumber } from "@/features/quotes/status";
import { VisitRow } from "@/features/visits/components/visit-row";
import { formatLongDay, formatMonth } from "@/lib/calendar";
import { addDays, formatDate, todayInTimezone } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { getFinanceService } from "@/server/home";
import { getCompanyProfileService } from "@/server/quotes";
import { getActiveTenant } from "@/server/tenant";
import type { QuoteListItem } from "@/types/database";

export const metadata: Metadata = { title: "Início" };

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
          : `enviado há ${days} dia(s)`;
  return (
    <li>
      <Link href={`/dashboard/quotes/${quote.id}`} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm hover:underline">
        <span className="flex min-w-0 flex-1 basis-52 flex-col">
          <span className="font-medium break-words">
            #{formatQuoteNumber(quote.number)} · {quote.title ?? "Sem título"}
          </span>
          <span className="text-muted-foreground">
            {quote.client_name ?? "Sem cliente"} · {note}
          </span>
        </span>
        <span className="flex items-center gap-3">
          <Badge variant={quote.status === "approved" ? "success" : "info"}>{QUOTE_STATUS_LABEL[quote.status]}</Badge>
          <span className="font-medium tabular-nums">{formatCents(quote.total_cents)}</span>
        </span>
      </Link>
    </li>
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
  const monthName = formatMonth(today).split(" ")[0].toLowerCase();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex flex-wrap items-center gap-2 text-xl font-semibold tracking-tight">
            <span className="break-words">{active.name}</span>
            <Badge variant="outline">{ROLE_LABEL[active.role]}</Badge>
          </h2>
          <p className="text-sm text-muted-foreground first-letter:uppercase">{formatLongDay(today)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" render={<Link href="/dashboard/schedule?new=1" />} nativeButton={false}>
            Nova visita
          </Button>
          <Button render={<Link href="/dashboard/quotes/new" />} nativeButton={false}>
            Novo orçamento
          </Button>
        </div>
      </div>

      <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${finance ? "xl:grid-cols-4" : ""}`}>
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
          hint={`${home.awaitingReply.length} enviado(s) · ${formatCents(forecast.approvedCents)} aprovados para fechar`}
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
              hint={finance.dueSoonCount === 0 ? "Nenhuma conta nos próximos dias." : `${finance.dueSoonCount} conta(s)`}
            />
          </>
        ) : null}
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle>Hoje</CardTitle>
            <Link href="/dashboard/schedule" className="text-sm underline underline-offset-4">
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
              <CardTitle>Orçamentos em andamento</CardTitle>
              <Link href="/dashboard/quotes" className="text-sm underline underline-offset-4">
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
                <CardTitle>A pagar hoje</CardTitle>
                <Link href="/dashboard/expenses" className="text-sm underline underline-offset-4">
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
