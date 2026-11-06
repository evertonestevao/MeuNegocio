import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Check, ChevronLeft, ChevronRight, Clock, RotateCcw, Undo2, X } from "lucide-react";
import { ActionButton } from "@/components/action-button";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CloseMonthButton, EditEntryButton, NewEntryButton } from "@/features/hours/components/hours-forms";
import { TIME_ENTRY_STATUS_LABEL } from "@/features/hours/schemas";
import { CONTRACT_LABEL } from "@/features/team/schemas";
import { addMonths, formatMonth, isValidDate } from "@/lib/calendar";
import { formatDate, todayInTimezone } from "@/lib/dates";
import { formatMinutes, workedMinutes } from "@/lib/hoursCalc";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { removeTimeEntryAction, setSuggestionDismissedAction, setTimeEntryStatusAction } from "@/server/actions/hours";
import { getClientService } from "@/server/clients";
import { getHoursService } from "@/server/finance";
import { getCompanyProfileService } from "@/server/quotes";
import { getActiveTenant } from "@/server/tenant";
import { permissionService } from "@/services/permissionService";

export const metadata: Metadata = { title: "Horas" };

function Row({
  date,
  title,
  detail,
  time,
  total,
  badge,
  actions,
  muted,
}: {
  date: string;
  title: string;
  detail?: string;
  time: string;
  total: string;
  badge: React.ReactNode;
  actions: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <li className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 py-3 text-sm first:pt-0 last:pb-0", muted && "opacity-60")}>
      <span className="w-12 shrink-0 font-medium tabular-nums">{formatDate(date).slice(0, 5)}</span>
      <div className="flex min-w-0 flex-1 basis-40 flex-col">
        <span className="break-words">{title}</span>
        <span className="text-xs text-muted-foreground">
          {time}
          {detail ? ` · ${detail}` : ""}
        </span>
      </div>
      <div className="flex items-center gap-2">
        {badge}
        <span className="w-12 text-right font-medium tabular-nums">{total}</span>
        <div className="flex">{actions}</div>
      </div>
    </li>
  );
}

export default async function HoursPage({ searchParams }: { searchParams: Promise<{ m?: string; p?: string; clt?: string }> }) {
  const params = await searchParams;
  const { active } = await getActiveTenant();
  if (!active) return null;
  if (!permissionService.canManageFinance(active.role)) redirect("/dashboard");

  const actor = { companyId: active.id, role: active.role };
  const service = await getHoursService();
  if (!(await service.canUse(actor))) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="font-heading text-2xl font-extrabold tracking-tight">Horas</h1>
        <EmptyState icon={Clock} title="Recurso fora do plano" description="As horas não estão incluídas no plano da empresa." />
      </div>
    );
  }

  const profile = await (await getCompanyProfileService()).get(active.id);
  const today = todayInTimezone(profile.timezone);
  const month = isValidDate(`${params.m}-01`) ? `${params.m}-01` : `${today.slice(0, 7)}-01`;
  const showClt = params.clt === "1";

  const [people, clients] = await Promise.all([
    service.getMonth(actor, month),
    (await getClientService()).listForPicker(actor),
  ]);
  const listed = people.filter((person) => showClt || person.contract_type !== "clt");
  const selected = listed.find((person) => person.id === params.p) ?? listed[0] ?? null;
  const monthLabel = formatMonth(month).toLowerCase();

  function href(overrides: Record<string, string | undefined>): string {
    const merged = { m: month.slice(0, 7), p: selected?.id, clt: showClt ? "1" : undefined, ...overrides };
    const query = Object.entries(merged).filter((entry): entry is [string, string] => Boolean(entry[1]));
    return `/dashboard/hours?${new URLSearchParams(query).toString()}`;
  }

  const lines = selected
    ? [
        ...selected.entries.map((entry) => ({ key: entry.id, date: entry.entry_date + entry.starts_at, entry, suggestion: undefined })),
        ...selected.suggestions.map((suggestion) => ({ key: suggestion.visit_id, date: suggestion.entry_date + suggestion.starts_at, entry: undefined, suggestion })),
      ].sort((a, b) => a.date.localeCompare(b.date))
    : [];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-extrabold tracking-tight">Horas</h1>
        <p className="text-sm text-muted-foreground">
          Horas sugeridas pela agenda de visitas. Confira, ajuste o que for preciso e feche o período dos prestadores.
        </p>
      </div>

      <p className="rounded-lg bg-muted px-3 py-2 text-sm">
        Este registro serve para gestão e pagamento de prestadores e não substitui o ponto eletrônico de funcionários CLT.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="icon-sm" render={<Link scroll={false} href={href({ m: addMonths(month, -1).slice(0, 7) })} aria-label="Mês anterior" />} nativeButton={false}>
          <ChevronLeft className="size-4" />
        </Button>
        <span className="min-w-36 text-center text-sm font-medium">{formatMonth(month)}</span>
        <Button variant="outline" size="icon-sm" render={<Link scroll={false} href={href({ m: addMonths(month, 1).slice(0, 7) })} aria-label="Próximo mês" />} nativeButton={false}>
          <ChevronRight className="size-4" />
        </Button>
        <Link scroll={false} href={href({ clt: showClt ? undefined : "1" })} className="rounded-lg border px-3 py-1.5 text-sm hover:bg-muted" aria-pressed={showClt}>
          {showClt ? "Ocultar CLT" : "Mostrar também CLT"}
        </Link>
      </div>

      {listed.length === 0 ? (
        <EmptyState icon={Clock} title="Nenhum prestador" description="Cadastre pessoas como PJ ou autônomo em Equipe para calcular as horas a pagar." />
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
          <Card className="py-0">
            <ul className="flex flex-col divide-y">
              {listed.map((person) => (
                <li key={person.id}>
                  <Link
                    scroll={false} href={href({ p: person.id })}
                    aria-current={person.id === selected?.id ? "true" : undefined}
                    className={cn("flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-muted/50", person.id === selected?.id && "bg-muted")}
                  >
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="flex flex-wrap items-center gap-1.5 font-medium">
                        {person.name} <Badge variant="secondary">{CONTRACT_LABEL[person.contract_type]}</Badge>
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {person.contract_type === "clt" ? "Recebe por recorrência" : `${formatCents(person.hourly_pay_cents)}/h`}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end tabular-nums">
                      <span className="font-medium">{formatMinutes(person.openMinutes)}</span>
                      {person.contract_type === "clt" ? null : <span className="text-xs text-muted-foreground">{formatCents(person.openPayCents)}</span>}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>

          {selected ? (
            <Card>
              <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
                <CardTitle>Justificativa — {selected.name}</CardTitle>
                <NewEntryButton employeeId={selected.id} clients={clients} defaultDate={today < addMonths(month, 1) && today >= month ? today : month} />
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {lines.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhuma hora neste mês.</p>
                ) : (
                  <ul className="flex flex-col divide-y">
                    {lines.map(({ key, entry, suggestion }) => {
                      if (suggestion) {
                        const time = `${suggestion.starts_at.slice(0, 5)}–${suggestion.ends_at.slice(0, 5)}`;
                        const fields = { visitId: suggestion.visit_id, employeeId: selected.id };
                        return (
                          <Row
                            key={key}
                            muted={suggestion.dismissed}
                            date={suggestion.entry_date}
                            title={suggestion.client_name}
                            detail={[suggestion.location_name, suggestion.break_minutes ? `${suggestion.break_minutes} min de intervalo` : null].filter(Boolean).join(" · ")}
                            time={time}
                            total={suggestion.dismissed ? "—" : formatMinutes(workedMinutes(suggestion))}
                            badge={<Badge variant="outline">{suggestion.dismissed ? "Retirado" : "Da agenda"}</Badge>}
                            actions={
                              suggestion.dismissed ? (
                                <ActionButton action={setSuggestionDismissedAction} fields={{ ...fields, dismissed: "false" }} size="icon-sm" variant="ghost" ariaLabel={`Incluir ${suggestion.client_name}`}>
                                  <RotateCcw className="size-4" />
                                </ActionButton>
                              ) : (
                                <>
                                  <EditEntryButton employeeId={selected.id} suggestion={suggestion} clients={clients} />
                                  <ActionButton action={setSuggestionDismissedAction} fields={{ ...fields, dismissed: "true" }} size="icon-sm" variant="ghost" ariaLabel={`Retirar ${suggestion.client_name} do período`}>
                                    <X className="size-4" />
                                  </ActionButton>
                                </>
                              )
                            }
                          />
                        );
                      }
                      if (!entry) return null;
                      const paid = entry.status === "paid";
                      const title = entry.client_name ?? "Hora avulsa";
                      return (
                        <Row
                          key={key}
                          date={entry.entry_date}
                          title={title}
                          detail={[entry.location_name, entry.notes, entry.break_minutes ? `${entry.break_minutes} min de intervalo` : null].filter(Boolean).join(" · ")}
                          time={`${entry.starts_at.slice(0, 5)}–${entry.ends_at.slice(0, 5)}`}
                          total={formatMinutes(workedMinutes(entry))}
                          badge={<Badge variant={paid ? "success" : "warning"}>{TIME_ENTRY_STATUS_LABEL[entry.status]}</Badge>}
                          actions={
                            paid ? null : (
                              <>
                                {entry.status === "pending" ? (
                                  <ActionButton action={setTimeEntryStatusAction} fields={{ entryId: entry.id, status: "approved" }} size="icon-sm" variant="ghost" ariaLabel={`Aprovar ${title}`}>
                                    <Check className="size-4" />
                                  </ActionButton>
                                ) : (
                                  <ActionButton action={setTimeEntryStatusAction} fields={{ entryId: entry.id, status: "pending" }} size="icon-sm" variant="ghost" ariaLabel={`Voltar ${title} para pendente`}>
                                    <Undo2 className="size-4" />
                                  </ActionButton>
                                )}
                                <EditEntryButton employeeId={selected.id} entry={entry} clients={clients} />
                                <ActionButton action={removeTimeEntryAction} fields={{ entryId: entry.id }} size="icon-sm" variant="ghost" ariaLabel={`Retirar ${title} do período`}>
                                  <X className="size-4" />
                                </ActionButton>
                              </>
                            )
                          }
                        />
                      );
                    })}
                  </ul>
                )}
                <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                  <div className="flex items-baseline gap-3 text-sm">
                    <span className="text-muted-foreground">Total em aberto</span>
                    <strong className="tabular-nums">{formatMinutes(selected.openMinutes)}</strong>
                    {selected.contract_type === "clt" ? null : <strong className="tabular-nums">{formatCents(selected.openPayCents)}</strong>}
                  </div>
                  {selected.contract_type === "clt" ? (
                    <p className="text-sm text-muted-foreground">Recebe salário. Cadastre o salário em Gastos, nas recorrências.</p>
                  ) : selected.openMinutes > 0 ? (
                    <CloseMonthButton
                      employeeId={selected.id}
                      name={selected.name}
                      month={month}
                      monthLabel={monthLabel}
                      openMinutes={selected.openMinutes}
                      hourlyCents={selected.hourly_pay_cents}
                    />
                  ) : null}
                </div>
                {selected.paidMinutes > 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {formatMinutes(selected.paidMinutes)} já pagas neste mês. Para corrigir, exclua o pagamento em Gastos.
                  </p>
                ) : null}
              </CardContent>
            </Card>
          ) : null}
        </div>
      )}
    </div>
  );
}
