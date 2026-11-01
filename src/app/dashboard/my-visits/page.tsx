import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { VISIT_KIND_LABEL, VISIT_STATUS_LABEL } from "@/features/visits/schemas";
import { addDays, formatDate, todayInTimezone } from "@/lib/dates";
import { getCompanyProfileService } from "@/server/quotes";
import { getActiveTenant } from "@/server/tenant";
import { getWorkOrderService } from "@/server/workOrders";
import type { VisitSheet } from "@/types/workOrders";
import { VISIT_STATUS_VARIANT } from "@/features/visits/components/visit-row";

export const metadata: Metadata = { title: "Minhas visitas" };

function VisitCard({ visit, today }: { visit: VisitSheet; today: string }) {
  const tomorrow = addDays(today, 1);
  const day = visit.visit_date === today ? "Hoje" : visit.visit_date === tomorrow ? "Amanhã" : formatDate(visit.visit_date);
  return (
    <li>
      <Link href={`/dashboard/work-orders/${visit.id}`}>
        <Card className="py-3 hover:bg-muted/50">
          <CardContent className="flex items-start gap-3 px-4">
            <div className="flex w-16 shrink-0 flex-col text-sm">
              <span className="font-medium tabular-nums">{visit.starts_at.slice(0, 5)}</span>
              <span className="text-xs text-muted-foreground">{day}</span>
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
              <span className="font-medium break-words">{visit.client_name}</span>
              <span className="text-muted-foreground">{visit.location.name}</span>
              <div className="flex flex-wrap gap-1">
                <Badge variant="outline">{VISIT_KIND_LABEL[visit.kind]}</Badge>
                <Badge variant={VISIT_STATUS_VARIANT[visit.status]}>{VISIT_STATUS_LABEL[visit.status]}</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </Link>
    </li>
  );
}

export default async function MyVisitsPage() {
  const { active } = await getActiveTenant();
  if (!active) return null;

  const profile = await (await getCompanyProfileService()).get(active.id);
  const today = todayInTimezone(profile.timezone);
  const visits = await (await getWorkOrderService()).listMine(
    { companyId: active.id, role: active.role },
    addDays(today, -14),
    addDays(today, 60),
  );
  const open = visits.filter((visit) => visit.status === "scheduled" || visit.status === "in_progress");
  const finished = visits.filter((visit) => visit.status === "completed").reverse();

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div>
        <h2 className="font-heading text-2xl font-extrabold tracking-tight">Minhas visitas</h2>
        <p className="text-sm text-muted-foreground">Toque em uma visita para abrir a ordem de serviço.</p>
      </div>

      {open.length === 0 ? (
        <EmptyState icon={CalendarDays} title="Nenhuma visita agendada" description="Quando você for escalado, a visita aparece aqui." />
      ) : (
        <section className="flex flex-col gap-3">
          <h3 className="text-sm font-medium text-muted-foreground">Próximas visitas</h3>
          <ul className="flex flex-col gap-3">
            {open.map((visit) => (
              <VisitCard key={visit.id} visit={visit} today={today} />
            ))}
          </ul>
        </section>
      )}

      {finished.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Concluídas recentemente</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col divide-y text-sm">
              {finished.map((visit) => (
                <li key={visit.id}>
                  <Link href={`/dashboard/work-orders/${visit.id}`} className="flex justify-between gap-3 py-2 hover:underline">
                    <span className="min-w-0 break-words">{visit.client_name}</span>
                    <span className="shrink-0 text-muted-foreground">{formatDate(visit.visit_date)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
