import { z } from "zod";
import { checklistLabelsSchema } from "@/features/work-orders/schemas";

/** Validação da visita: roda no navegador e de novo no servidor. */

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Informe o horário.");

export const visitSchema = z
  .object({
    clientId: z.uuid({ error: "Escolha o cliente." }),
    locationId: z.uuid({ error: "Escolha o local da visita." }),
    quoteId: z.union([z.uuid(), z.literal("")]).transform((value) => value || null),
    kind: z.enum(["assessment", "execution"], { error: "Escolha o tipo da visita." }),
    visitDate: z.iso.date({ error: "Informe a data." }),
    startsAt: time,
    endsAt: time,
    status: z.enum(["scheduled", "in_progress", "completed", "canceled"], { error: "Escolha a situação." }),
    notes: z.string().trim().max(2000, "Use até 2000 caracteres."),
    employeeIds: z.array(z.uuid()).min(1, "Escolha ao menos uma pessoa da equipe."),
    /** Lista só deste atendimento. Nula: usa o modelo da empresa. */
    checklist: checklistLabelsSchema.nullable().default(null),
  })
  .refine((visit) => visit.endsAt > visit.startsAt, { message: "O horário de término precisa ser depois do início." });

export type VisitInput = z.output<typeof visitSchema>;

export function parseVisitForm(formData: FormData): VisitInput {
  const text = (key: string) => {
    const value = formData.get(key);
    return typeof value === "string" ? value : "";
  };
  return visitSchema.parse({
    clientId: text("clientId"),
    locationId: text("locationId"),
    quoteId: text("quoteId"),
    kind: text("kind"),
    visitDate: text("visitDate"),
    startsAt: text("startsAt"),
    endsAt: text("endsAt"),
    status: text("status"),
    notes: text("notes"),
    employeeIds: formData.getAll("employeeIds").map(String),
    checklist: formData.get("checklistCustom") === "1" ? formData.getAll("checklist").map(String) : null,
  });
}

export const VISIT_KIND_LABEL = { assessment: "Visita técnica", execution: "Execução" } as const;
export const VISIT_STATUS_LABEL = {
  scheduled: "Agendada",
  in_progress: "Em andamento",
  completed: "Concluída",
  canceled: "Cancelada",
} as const;

/** "Agora" na timezone da empresa, para saber se uma visita passou da hora. */
export interface VisitClock {
  today: string;
  time: string;
}

/**
 * Visita agendada cujo horário já passou e que não começou: está atrasada. Serve para o Início e
 * a agenda mostrarem "Atrasada" em vez de "Agendada"/"Próxima".
 */
export function isVisitOverdue(
  visit: { status: string; visit_date: string; starts_at: string },
  now: VisitClock,
): boolean {
  if (visit.status !== "scheduled") return false;
  if (visit.visit_date < now.today) return true;
  return visit.visit_date === now.today && visit.starts_at.slice(0, 5) < now.time.slice(0, 5);
}
