import Link from "next/link";
import { Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/dates";
import type { VisitListItem } from "@/types/database";
import { VISIT_KIND_LABEL, VISIT_STATUS_LABEL } from "../schemas";

export const VISIT_STATUS_VARIANT = {
  scheduled: "info",
  in_progress: "warning",
  completed: "success",
  canceled: "secondary",
} as const;

/** Mesma lógica de cor nos pontos do calendário e na barra lateral da linha. */
export const VISIT_STATUS_BAR = {
  scheduled: "bg-info",
  in_progress: "bg-warning",
  completed: "bg-success",
  canceled: "bg-muted-foreground/40",
} as const;

/** Linha de visita, usada na agenda, no cliente e no orçamento. */
export function VisitRow({ visit, showDate, showClient = true, actions }: { visit: VisitListItem; showDate?: boolean; showClient?: boolean; actions?: React.ReactNode }) {
  const canceled = visit.status === "canceled";
  const start = visit.starts_at.slice(0, 5);
  const end = visit.ends_at.slice(0, 5);
  return (
    <div className="flex gap-3 py-3 first:pt-0 last:pb-0">
      <span className={`w-1 shrink-0 rounded-full ${VISIT_STATUS_BAR[visit.status]}`} aria-hidden />
      <div className={`flex w-12 shrink-0 flex-col tabular-nums ${canceled ? "text-muted-foreground line-through" : ""}`}>
        {showDate ? <span className="text-xs text-muted-foreground">{formatDate(visit.visit_date).slice(0, 5)}</span> : null}
        <span className="font-heading text-base font-bold">{start}</span>
        <span className="text-xs text-muted-foreground">{end}</span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className={`flex flex-col gap-0.5 ${canceled ? "text-muted-foreground line-through" : ""}`}>
          <span className="break-words font-semibold">{showClient ? visit.client_name : visit.location_name}</span>
          {showClient ? <span className="break-words text-muted-foreground">{visit.location_name}</span> : null}
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Users className="size-3.5 shrink-0" aria-hidden />
            {visit.employees.map((person) => person.name.split(" ")[0]).join(", ")}
          </span>
          {visit.notes ? <span className="text-xs text-muted-foreground no-underline">{visit.notes}</span> : null}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant={VISIT_STATUS_VARIANT[visit.status]}>{VISIT_STATUS_LABEL[visit.status]}</Badge>
          <Badge variant="outline">{VISIT_KIND_LABEL[visit.kind]}</Badge>
          {visit.status === "in_progress" || visit.status === "completed" ? (
            <Link href={`/dashboard/work-orders/${visit.id}`} className="px-1 text-sm font-medium text-primary hover:underline">
              Ordem de serviço
            </Link>
          ) : null}
          {actions ? <div className="ml-auto flex items-center">{actions}</div> : null}
        </div>
      </div>
    </div>
  );
}
