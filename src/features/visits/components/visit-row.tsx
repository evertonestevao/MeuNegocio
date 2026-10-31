import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/dates";
import type { VisitListItem } from "@/types/database";
import { VISIT_KIND_LABEL, VISIT_STATUS_LABEL } from "../schemas";

const STATUS_VARIANT = {
  scheduled: "secondary",
  in_progress: "default",
  completed: "outline",
  canceled: "outline",
} as const;

/** Linha de visita, usada na agenda, no cliente e no orçamento. */
export function VisitRow({ visit, showDate, showClient = true, actions }: { visit: VisitListItem; showDate?: boolean; showClient?: boolean; actions?: React.ReactNode }) {
  const canceled = visit.status === "canceled";
  const time = `${visit.starts_at.slice(0, 5)}–${visit.ends_at.slice(0, 5)}`;
  return (
    <div className="flex items-start justify-between gap-2 py-3 first:pt-0 last:pb-0">
      <div className={`flex min-w-0 flex-col gap-0.5 text-sm ${canceled ? "text-muted-foreground line-through" : ""}`}>
        <span className="font-medium tabular-nums">{showDate ? `${formatDate(visit.visit_date)} · ${time}` : time}</span>
        <span className="break-words">{showClient ? `${visit.client_name} · ${visit.location_name}` : visit.location_name}</span>
        <span className="text-muted-foreground">{visit.employees.map((person) => person.name.split(" ")[0]).join(", ")}</span>
        {visit.notes ? <span className="text-xs text-muted-foreground no-underline">{visit.notes}</span> : null}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <div className="flex flex-wrap justify-end gap-1">
          <Badge variant="outline">{VISIT_KIND_LABEL[visit.kind]}</Badge>
          <Badge variant={STATUS_VARIANT[visit.status]}>{VISIT_STATUS_LABEL[visit.status]}</Badge>
        </div>
        {actions ? <div className="flex">{actions}</div> : null}
      </div>
    </div>
  );
}
