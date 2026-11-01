"use client";

import { Pencil, Plus } from "lucide-react";
import { DialogForm } from "@/components/dialog-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { parseTimeEntryForm } from "@/features/hours/schemas";
import { formatMinutes, payCents } from "@/lib/hoursCalc";
import { formatCents } from "@/lib/money";
import { closeContractorMonthAction, saveTimeEntryAction } from "@/server/actions/hours";
import type { ClientPickerOption } from "@/types/database";
import type { TimeEntry, TimeSuggestion } from "@/types/finance";

const SELECT_CLASS =
  "border-input h-11 md:h-9 w-full rounded-lg border bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

function EntryFields({
  employeeId,
  entry,
  suggestion,
  clients,
  defaultDate,
}: {
  employeeId: string;
  entry?: TimeEntry;
  suggestion?: TimeSuggestion;
  clients: ClientPickerOption[];
  defaultDate: string;
}) {
  const source = entry ?? suggestion;
  const prefix = entry?.id ?? suggestion?.visit_id ?? `new-entry-${employeeId}`;
  const fromVisit = Boolean(entry?.visit_id ?? suggestion?.visit_id);
  return (
    <>
      <input type="hidden" name="employeeId" value={employeeId} />
      {entry ? <input type="hidden" name="entryId" value={entry.id} /> : null}
      {suggestion ? <input type="hidden" name="visitId" value={suggestion.visit_id} /> : null}
      {suggestion ? <input type="hidden" name="clientId" value={suggestion.client_id} /> : null}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${prefix}-date`}>Data</Label>
        <Input id={`${prefix}-date`} name="entryDate" type="date" defaultValue={source?.entry_date ?? defaultDate} />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor={`${prefix}-start`}>Entrada</Label>
          <Input id={`${prefix}-start`} name="startsAt" type="time" defaultValue={source?.starts_at.slice(0, 5) ?? "08:00"} />
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor={`${prefix}-end`}>Saída</Label>
          <Input id={`${prefix}-end`} name="endsAt" type="time" defaultValue={source?.ends_at.slice(0, 5) ?? "12:00"} />
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor={`${prefix}-break`}>Intervalo (min)</Label>
          <Input id={`${prefix}-break`} name="breakMinutes" inputMode="numeric" defaultValue={source?.break_minutes ?? 0} />
        </div>
      </div>
      {fromVisit ? null : (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${prefix}-client`}>Cliente (opcional)</Label>
          <select id={`${prefix}-client`} name="clientId" defaultValue={entry?.client_id ?? ""} className={SELECT_CLASS}>
            <option value="">Sem cliente</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${prefix}-notes`}>Observações</Label>
        <Input id={`${prefix}-notes`} name="notes" defaultValue={entry?.notes ?? ""} />
      </div>
    </>
  );
}

export function NewEntryButton({ employeeId, clients, defaultDate }: { employeeId: string; clients: ClientPickerOption[]; defaultDate: string }) {
  return (
    <DialogForm
      title="Incluir horas avulsas"
      action={saveTimeEntryAction}
      validate={parseTimeEntryForm}
      submitLabel="Salvar horas"
      trigger={(open) => (
        <Button variant="outline" size="sm" onClick={open}>
          <Plus className="size-4" /> Incluir horas avulsas
        </Button>
      )}
    >
      <EntryFields employeeId={employeeId} clients={clients} defaultDate={defaultDate} />
    </DialogForm>
  );
}

export function EditEntryButton({
  employeeId,
  entry,
  suggestion,
  clients,
}: {
  employeeId: string;
  entry?: TimeEntry;
  suggestion?: TimeSuggestion;
  clients: ClientPickerOption[];
}) {
  return (
    <DialogForm
      title="Ajustar horas"
      description={suggestion ? "Ao salvar, a sugestão da agenda vira um apontamento." : undefined}
      action={saveTimeEntryAction}
      validate={parseTimeEntryForm}
      submitLabel="Salvar horas"
      trigger={(open) => (
        <Button variant="edit" size="icon-sm" aria-label="Ajustar horas" onClick={open}>
          <Pencil className="size-4" />
        </Button>
      )}
    >
      <EntryFields employeeId={employeeId} entry={entry} suggestion={suggestion} clients={clients} defaultDate="" />
    </DialogForm>
  );
}

export function CloseMonthButton({
  employeeId,
  name,
  month,
  monthLabel,
  openMinutes,
  hourlyCents,
}: {
  employeeId: string;
  name: string;
  month: string;
  monthLabel: string;
  openMinutes: number;
  hourlyCents: number;
}) {
  return (
    <DialogForm
      title="Fechar e pagar"
      description={`Fechar ${formatMinutes(openMinutes)} de ${name} em ${monthLabel}? Será lançado um gasto de ${formatCents(payCents(openMinutes, hourlyCents))}. Depois de pago, as horas ficam travadas; para corrigir, exclua o pagamento em Gastos.`}
      action={closeContractorMonthAction}
      submitLabel="Fechar e pagar"
      trigger={(open) => <Button onClick={open}>Fechar e pagar</Button>}
    >
      <input type="hidden" name="employeeId" value={employeeId} />
      <input type="hidden" name="month" value={month} />
    </DialogForm>
  );
}
