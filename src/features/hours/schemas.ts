import { z } from "zod";

/** Validação de horas: roda no navegador e de novo no servidor. */

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Informe o horário.");
const optionalUuid = z.union([z.uuid(), z.literal("")]).transform((value) => value || null);

export const timeEntrySchema = z
  .object({
    employeeId: z.uuid({ error: "Escolha a pessoa." }),
    entryDate: z.iso.date({ error: "Informe a data." }),
    startsAt: time,
    endsAt: time,
    breakMinutes: z.coerce.number({ error: "Informe o intervalo em minutos." }).int("Informe o intervalo em minutos.").min(0, "O intervalo não pode ser negativo.").max(720, "Intervalo longo demais."),
    visitId: optionalUuid,
    clientId: optionalUuid,
    notes: z.string().trim().max(500, "Use até 500 caracteres."),
  })
  .refine((entry) => entry.endsAt > entry.startsAt, { message: "O horário de saída precisa ser depois da entrada." });

export type TimeEntryInput = z.output<typeof timeEntrySchema>;

export function parseTimeEntryForm(formData: FormData): TimeEntryInput {
  const text = (key: string) => {
    const value = formData.get(key);
    return typeof value === "string" ? value : "";
  };
  return timeEntrySchema.parse({
    employeeId: text("employeeId"),
    entryDate: text("entryDate"),
    startsAt: text("startsAt"),
    endsAt: text("endsAt"),
    breakMinutes: text("breakMinutes") || "0",
    visitId: text("visitId"),
    clientId: text("clientId"),
    notes: text("notes"),
  });
}

export const TIME_ENTRY_STATUS_LABEL = { pending: "Pendente", approved: "Aprovado", paid: "Pago" } as const;
