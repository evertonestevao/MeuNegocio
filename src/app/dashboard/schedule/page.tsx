import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DeleteVisitButton, EditVisitButton, NewVisitButton } from "@/features/visits/components/visit-form";
import { VisitRow } from "@/features/visits/components/visit-row";
import { addMonths, formatLongDay, formatMonth, isValidDate, monthGrid, weekDays } from "@/lib/calendar";
import { addDays, formatDate, todayInTimezone } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { getClientService } from "@/server/clients";
import { getCompanyProfileService, getQuoteService } from "@/server/quotes";
import { getEmployeeService, getVisitService } from "@/server/schedule";
import { getChecklistService } from "@/server/checklists";
import { getActiveTenant } from "@/server/tenant";
import { permissionService } from "@/services/permissionService";
import type { VisitKind } from "@/types/database";
import { VISIT_STATUS_BAR } from "@/features/visits/components/visit-row";
import { VISIT_STATUS_LABEL } from "@/features/visits/schemas";

const VISIT_STATUS_BORDER = {
  scheduled: "border-l-info",
  in_progress: "border-l-warning",
  completed: "border-l-success",
  canceled: "border-l-muted-foreground/40",
} as const;

export const metadata: Metadata = { title: "Agenda" };

const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const SELECT_CLASS =
  "border-input h-11 md:h-9 min-w-0 rounded-lg border bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; d?: string; employee?: string; kind?: string; new?: string; quote?: string; client?: string }>;
}) {
  const params = await searchParams;
  const { active } = await getActiveTenant();
  if (!active) return null;
  if (!permissionService.canManageSchedule(active.role)) redirect("/dashboard");

  const actor = { companyId: active.id, role: active.role };
  const profile = await (await getCompanyProfileService()).get(active.id);
  const today = todayInTimezone(profile.timezone);
  const view = params.view === "week" ? "week" : "month";
  const selected = isValidDate(params.d) ? params.d : today;
  const kind: VisitKind | undefined = params.kind === "assessment" || params.kind === "execution" ? params.kind : undefined;
  const days = view === "week" ? weekDays(selected) : monthGrid(selected);

  const visitService = await getVisitService();
  const [visits, employees, clients, quotePicker, checklists] = await Promise.all([
    visitService.list(actor, { from: days[0], to: days.at(-1), kind, employeeId: params.employee || undefined }),
    (await getEmployeeService()).list(actor, today),
    (await getClientService()).listForPicker(actor),
    visitService.listQuotePicker(actor),
    (await getChecklistService()).list(actor),
  ]);
  const options = {
    clients,
    employees: employees.map(({ id, name, active: isActive }) => ({ id, name, active: isActive })),
    quotes: quotePicker,
    checklists,
  };
  const canDelete = permissionService.canDeleteRecords(active.role);

  // "Agendar execução" no orçamento e "Agendar visita" no cliente chegam aqui já preenchidos.
  const sourceQuote = params.quote
    ? await (await getQuoteService()).getDetail(actor, params.quote).catch(() => null)
    : null;
  const prefill = {
    date: selected,
    clientId: sourceQuote?.quote.client_id ?? (clients.some((client) => client.id === params.client) ? params.client : null),
    locationId: sourceQuote?.quote.location_id ?? null,
    quoteId: sourceQuote?.quote.id ?? null,
    kind: sourceQuote ? ("execution" as const) : undefined,
  };

  function href(overrides: Record<string, string | undefined>): string {
    const merged: Record<string, string | undefined> = { view, d: selected, employee: params.employee, kind, ...overrides };
    const query = Object.entries(merged).filter((entry): entry is [string, string] => Boolean(entry[1]));
    return `/dashboard/schedule?${new URLSearchParams(query).toString()}`;
  }

  const visitsOn = (day: string) => visits.filter((visit) => visit.visit_date === day);
  const dayVisits = visitsOn(selected);
  const previous = view === "week" ? addDays(selected, -7) : addMonths(selected, -1);
  const next = view === "week" ? addDays(selected, 7) : addMonths(selected, 1);
  const title = view === "week" ? `${formatDate(days[0])} a ${formatDate(days[6])}` : formatMonth(selected);
  const toggleClass = (on: boolean) =>
    cn("whitespace-nowrap rounded-full px-3.5 py-2 text-sm lg:py-1.5", on ? "bg-primary font-medium text-primary-foreground" : "border bg-card hover:bg-muted");

  const rowActions = (visit: (typeof visits)[number]) => (
    <>
      <EditVisitButton visit={visit} options={options} />
      {canDelete ? <DeleteVisitButton visit={visit} /> : null}
    </>
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3 max-sm:[&>*]:w-full">
        <div>
          <h1 className="font-heading text-2xl font-extrabold tracking-tight">Agenda</h1>
          <p className="text-sm text-muted-foreground">Visitas técnicas e execuções, com a equipe escalada.</p>
        </div>
        <NewVisitButton prefill={prefill} options={options} defaultOpen={params.new === "1"} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="icon-sm" render={<Link scroll={false} href={href({ d: previous })} aria-label="Anterior" />} nativeButton={false}>
          <ChevronLeft className="size-4" />
        </Button>
        <span className="min-w-36 text-center text-sm font-medium">{title}</span>
        <Button variant="outline" size="icon-sm" render={<Link scroll={false} href={href({ d: next })} aria-label="Próximo" />} nativeButton={false}>
          <ChevronRight className="size-4" />
        </Button>
        <Link scroll={false} href={href({ d: today })} className={toggleClass(false)}>
          Hoje
        </Link>
        <Link scroll={false} href={href({ view: "month" })} className={toggleClass(view === "month")}>
          Mês
        </Link>
        <Link scroll={false} href={href({ view: "week" })} className={toggleClass(view === "week")}>
          Semana
        </Link>
        <form action="/dashboard/schedule" className="grid w-full min-w-0 grid-cols-[1fr_1fr_auto] items-center gap-2 lg:ml-auto lg:flex lg:w-auto">
          <input type="hidden" name="view" value={view} />
          <input type="hidden" name="d" value={selected} />
          <select name="employee" aria-label="Filtrar por pessoa" defaultValue={params.employee ?? ""} className={SELECT_CLASS}>
            <option value="">Toda a equipe</option>
            {employees.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>
          <select name="kind" aria-label="Filtrar por tipo" defaultValue={kind ?? ""} className={SELECT_CLASS}>
            <option value="">Todos os tipos</option>
            <option value="assessment">Visita técnica</option>
            <option value="execution">Execução</option>
          </select>
          <Button type="submit" variant="outline" size="sm">
            Filtrar
          </Button>
        </form>
      </div>

      {view === "month" ? (
        <Card className="py-0">
          <div className="grid grid-cols-7 border-b text-center text-xs font-medium text-muted-foreground">
            {WEEKDAY_LABELS.map((label) => (
              <div key={label} className="py-2">
                {label}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {days.map((day) => {
              const list = visitsOn(day);
              const activeCount = list.filter((visit) => visit.status !== "canceled").length;
              const outside = day.slice(0, 7) !== selected.slice(0, 7);
              return (
                <Link
                  key={day}
                  scroll={false} href={href({ d: day })}
                  aria-label={`${formatLongDay(day)}, ${activeCount} visita(s)`}
                  aria-current={day === selected ? "date" : undefined}
                  className={cn(
                    "flex min-h-16 min-w-0 flex-col items-center gap-1 border-r border-b p-1 text-sm hover:bg-muted/60 lg:min-h-24 lg:items-stretch lg:p-1.5 lg:text-xs [&:nth-child(7n)]:border-r-0",
                    outside && "text-muted-foreground/50",
                    day === selected && "ring-2 ring-inset ring-foreground",
                  )}
                >
                  <span className={cn("flex size-7 items-center justify-center rounded-full tabular-nums lg:size-6", "font-semibold", day === today && "bg-foreground text-background")}>
                    {Number(day.slice(8))}
                  </span>
                  {list.slice(0, 3).map((visit) => (
                    <span
                      key={visit.id}
                      className={cn(
                        "hidden truncate rounded border-l-2 bg-secondary px-1 py-0.5 lg:block",
                        VISIT_STATUS_BORDER[visit.status],
                        visit.status === "canceled" && "line-through opacity-60",
                      )}
                    >
                      {visit.starts_at.slice(0, 5)} {visit.client_name.split(" ")[0]}
                    </span>
                  ))}
                  {list.length > 3 ? <span className="hidden text-muted-foreground lg:block">+{list.length - 3}</span> : null}
                  {activeCount > 0 ? (
                    <span className="flex size-6 items-center justify-center rounded-full bg-sidebar-primary text-xs font-bold text-sidebar-primary-foreground tabular-nums lg:hidden" aria-hidden>
                      {activeCount}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </div>
        </Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-7">
          {days.map((day, index) => (
            <Card key={day} className={cn("gap-2 py-3", day === selected && "border-primary")}>
              <CardHeader className="px-3">
                <Link scroll={false} href={href({ d: day })} className="text-sm font-medium hover:underline">
                  {WEEKDAY_LABELS[index]} {formatDate(day).slice(0, 5)}
                </Link>
              </CardHeader>
              <CardContent className="flex flex-col gap-1 px-3 text-xs">
                {visitsOn(day).length === 0 ? <span className="text-muted-foreground">Sem visitas</span> : null}
                {visitsOn(day).map((visit) => (
                  <Link
                    key={visit.id}
                    scroll={false} href={href({ d: day })}
                    className={cn("rounded bg-secondary px-1.5 py-1 hover:underline", visit.status === "canceled" && "line-through opacity-60")}
                  >
                    <span className="font-medium tabular-nums">{visit.starts_at.slice(0, 5)}</span> {visit.client_name}
                  </Link>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ul className="-mt-3 hidden flex-wrap gap-x-4 lg:flex gap-y-1 text-xs text-muted-foreground" aria-label="Legenda das situações">
        {(["scheduled", "in_progress", "completed"] as const).map((status) => (
          <li key={status} className="flex items-center gap-1.5">
            <span className={cn("size-2 rounded-full", VISIT_STATUS_BAR[status])} aria-hidden />
            {VISIT_STATUS_LABEL[status]}
          </li>
        ))}
      </ul>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle className="first-letter:uppercase">{formatLongDay(selected)}</CardTitle>
          <NewVisitButton key={selected} prefill={{ date: selected }} options={options} label="Nova visita neste dia" variant="outline" />
        </CardHeader>
        <CardContent>
          {dayVisits.length === 0 ? (
            <EmptyState icon={CalendarDays} title="Nenhuma visita neste dia" />
          ) : (
            <div className="flex flex-col divide-y">
              {dayVisits.map((visit) => (
                <VisitRow key={visit.id} visit={visit} actions={rowActions(visit)} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
