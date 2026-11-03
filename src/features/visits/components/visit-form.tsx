"use client";

import { useState } from "react";
import { Check, Pencil, Plus, Trash2 } from "lucide-react";
import { DialogForm } from "@/components/dialog-form";
import { ChecklistEditor } from "@/features/checklists/components/checklist-editor";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatQuoteNumber, QUOTE_STATUS_LABEL } from "@/features/quotes/status";
import { VISIT_STATUS_LABEL, parseVisitForm } from "@/features/visits/schemas";
import { cn } from "@/lib/utils";
import { deleteVisitAction, saveVisitAction } from "@/server/actions/visits";
import type { ClientPickerOption, Employee, QuotePickerOption, VisitKind, VisitListItem, VisitStatus } from "@/types/database";
import { useVisitConflicts } from "../hooks/use-visit-conflicts";

const SELECT_CLASS =
  "border-input h-11 md:h-9 w-full min-w-0 rounded-lg border bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

export interface VisitFormOptions {
  clients: ClientPickerOption[];
  employees: Pick<Employee, "id" | "name" | "active">[];
  quotes: QuotePickerOption[];
  checklists: Record<VisitKind, string[]>;
}

export interface VisitPrefill {
  date: string;
  clientId?: string | null;
  locationId?: string | null;
  quoteId?: string | null;
  kind?: VisitKind;
}

function VisitFields({ visit, prefill, options }: { visit?: VisitListItem; prefill: VisitPrefill; options: VisitFormOptions }) {
  const prefix = visit?.id ?? "new-visit";
  const [clientId, setClientId] = useState(visit?.client_id ?? prefill.clientId ?? "");
  const [locationId, setLocationId] = useState(visit?.location_id ?? prefill.locationId ?? "");
  const [quoteId, setQuoteId] = useState(visit?.quote_id ?? prefill.quoteId ?? "");
  const [visitDate, setVisitDate] = useState(visit?.visit_date ?? prefill.date);
  const [startsAt, setStartsAt] = useState(visit?.starts_at.slice(0, 5) ?? "08:00");
  const [endsAt, setEndsAt] = useState(visit?.ends_at.slice(0, 5) ?? "12:00");
  const [status, setStatus] = useState<VisitStatus>(visit?.status ?? "scheduled");
  const [kind, setKind] = useState<VisitKind>(visit?.kind ?? prefill.kind ?? "assessment");
  // Nulo: a visita segue o modelo da empresa, e o que aparece acompanha o tipo escolhido.
  const [customChecklist, setCustomChecklist] = useState<string[] | null>(visit?.checklist_labels ?? null);
  const [chosen, setChosen] = useState<string[]>(visit?.employees.map((person) => person.id) ?? []);

  const client = options.clients.find((option) => option.id === clientId);
  const quotes = options.quotes.filter((quote) => quote.client_id === clientId);
  const conflicts = useVisitConflicts(status === "scheduled" || status === "in_progress", {
    visitId: visit?.id ?? null,
    visitDate,
    startsAt,
    endsAt,
  });
  const busy = new Set(conflicts.map((conflict) => conflict.employeeId));
  const nameOf = (id: string) => options.employees.find((person) => person.id === id)?.name ?? "";
  const chosenConflicts = conflicts.filter((conflict) => chosen.includes(conflict.employeeId));
  // Quem já está na visita continua na lista, mesmo tendo sido desativado depois.
  const selectable = options.employees.filter((person) => person.active || chosen.includes(person.id));

  return (
    <div className="flex flex-col gap-4">
      {visit ? <input type="hidden" name="visitId" value={visit.id} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor={`${prefix}-kind`}>Tipo da visita</Label>
          <select id={`${prefix}-kind`} name="kind" value={kind} onChange={(event) => setKind(event.target.value as VisitKind)} className={SELECT_CLASS}>
            <option value="assessment">Visita técnica (para orçamento)</option>
            <option value="execution">Execução do serviço</option>
          </select>
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor={`${prefix}-status`}>Situação</Label>
          <select
            id={`${prefix}-status`}
            name="status"
            value={status}
            onChange={(event) => setStatus(event.target.value as VisitStatus)}
            className={SELECT_CLASS}
          >
            {Object.entries(VISIT_STATUS_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor={`${prefix}-client`}>Cliente</Label>
          <select
            id={`${prefix}-client`}
            name="clientId"
            value={clientId}
            onChange={(event) => {
              setClientId(event.target.value);
              setLocationId("");
              setQuoteId("");
            }}
            className={SELECT_CLASS}
          >
            <option value="">Escolha o cliente</option>
            {options.clients.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor={`${prefix}-location`}>Local</Label>
          <select
            id={`${prefix}-location`}
            name="locationId"
            value={locationId}
            disabled={!client}
            onChange={(event) => setLocationId(event.target.value)}
            className={SELECT_CLASS}
          >
            <option value="">Escolha o local</option>
            {client?.locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </select>
          {client && client.locations.length === 0 ? (
            <p className="text-xs text-muted-foreground">Este cliente não tem locais. Cadastre um na tela do cliente.</p>
          ) : null}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2 flex min-w-0 flex-col gap-1.5">
          <Label htmlFor={`${prefix}-date`}>Data</Label>
          <Input id={`${prefix}-date`} name="visitDate" type="date" value={visitDate} onChange={(event) => setVisitDate(event.target.value)} />
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor={`${prefix}-start`}>Início</Label>
          <Input id={`${prefix}-start`} name="startsAt" type="time" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} />
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor={`${prefix}-end`}>Término</Label>
          <Input id={`${prefix}-end`} name="endsAt" type="time" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} />
        </div>
      </div>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1 text-sm font-medium">Quem vai</legend>
        <div className="flex flex-wrap gap-2">
          {selectable.map((person) => {
            const selected = chosen.includes(person.id);
            return (
              <label
                key={person.id}
                className={cn(
                  "flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-sm has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
                  selected && "border-primary bg-primary text-primary-foreground",
                  busy.has(person.id) && (selected ? "border-destructive bg-destructive text-white" : "border-destructive text-destructive"),
                )}
              >
                <input
                  type="checkbox"
                  name="employeeIds"
                  value={person.id}
                  checked={selected}
                  className="sr-only"
                  onChange={(event) =>
                    setChosen((current) =>
                      event.target.checked ? [...current, person.id] : current.filter((id) => id !== person.id),
                    )
                  }
                />
                {selected ? <Check className="size-3.5" aria-hidden /> : null}
                {person.name}
                {person.active ? "" : " (inativo)"}
              </label>
            );
          })}
        </div>
        {selectable.length === 0 ? (
          <p className="text-xs text-muted-foreground">Cadastre pessoas em Equipe para escalar.</p>
        ) : (
          <p className="text-xs text-muted-foreground">Quem já tem outra visita no mesmo horário fica marcado em vermelho.</p>
        )}
      </fieldset>
      {chosenConflicts.length > 0 ? (
        <Alert variant="destructive">
          <AlertTitle>Conflito de horário</AlertTitle>
          <AlertDescription>
            {chosenConflicts.map((conflict) => (
              <p key={`${conflict.employeeId}-${conflict.startsAt}`}>
                {nameOf(conflict.employeeId)} está em {conflict.clientName}, das {conflict.startsAt} às {conflict.endsAt}.
              </p>
            ))}
          </AlertDescription>
        </Alert>
      ) : null}
      <div className="flex min-w-0 flex-col gap-1.5">
        <Label htmlFor={`${prefix}-quote`}>Orçamento relacionado</Label>
        <select
          id={`${prefix}-quote`}
          name="quoteId"
          value={quoteId}
          disabled={!client}
          onChange={(event) => setQuoteId(event.target.value)}
          className={SELECT_CLASS}
        >
          <option value="">Nenhum</option>
          {quotes.map((quote) => (
            <option key={quote.id} value={quote.id}>
              #{formatQuoteNumber(quote.number)} · {quote.title ?? "Sem título"} ({QUOTE_STATUS_LABEL[quote.status]})
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">Opcional. Normalmente a execução está ligada a um orçamento aprovado.</p>
      </div>
      <div className="flex min-w-0 flex-col gap-1.5">
        <Label htmlFor={`${prefix}-notes`}>Observações</Label>
        <textarea
          id={`${prefix}-notes`}
          name="notes"
          defaultValue={visit?.notes ?? ""}
          className="border-input min-h-16 rounded-lg border bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
        />
      </div>
      {customChecklist !== null ? <input type="hidden" name="checklistCustom" value="1" /> : null}
      {customChecklist?.map((label, index) => <input key={index} type="hidden" name="checklist" value={label} />)}
      {status === "scheduled" ? (
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <Label>Checklist deste atendimento</Label>
            {customChecklist !== null ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => setCustomChecklist(null)}>
                Usar o modelo
              </Button>
            ) : null}
          </div>
          {customChecklist === null ? (
            <>
              <ul className="flex flex-col gap-0.5 text-sm text-muted-foreground">
                {options.checklists[kind].map((label) => (
                  <li key={label}>○ {label}</li>
                ))}
              </ul>
              <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => setCustomChecklist(options.checklists[kind])}>
                <Pencil className="size-4" /> Ajustar só nesta visita
              </Button>
            </>
          ) : (
            <ChecklistEditor idPrefix={`${prefix}-checklist`} labels={customChecklist} onChange={setCustomChecklist} />
          )}
        </div>
      ) : null}
    </div>
  );
}

export function NewVisitButton({
  prefill,
  options,
  defaultOpen,
  label = "Nova visita",
  variant = "default",
}: {
  prefill: VisitPrefill;
  options: VisitFormOptions;
  defaultOpen?: boolean;
  label?: string;
  variant?: "default" | "outline";
}) {
  return (
    <DialogForm
      title="Nova visita"
      action={saveVisitAction}
      validate={parseVisitForm}
      submitLabel="Salvar visita"
      defaultOpen={defaultOpen}
      trigger={(open) => (
        <Button variant={variant} onClick={open}>
          <Plus className="size-4" /> {label}
        </Button>
      )}
    >
      <VisitFields prefill={prefill} options={options} />
    </DialogForm>
  );
}

export function EditVisitButton({ visit, options }: { visit: VisitListItem; options: VisitFormOptions }) {
  return (
    <DialogForm
      title="Visita"
      action={saveVisitAction}
      validate={parseVisitForm}
      submitLabel="Salvar visita"
      trigger={(open) => (
        <Button variant="edit" size="icon-sm" aria-label={`Editar visita em ${visit.client_name}`} onClick={open}>
          <Pencil className="size-4" />
        </Button>
      )}
    >
      <VisitFields visit={visit} prefill={{ date: visit.visit_date }} options={options} />
    </DialogForm>
  );
}

export function DeleteVisitButton({ visit }: { visit: VisitListItem }) {
  return (
    <DialogForm
      title="Excluir visita"
      description={`Excluir a visita em ${visit.client_name}? Se ela só não vai acontecer, prefira marcar como cancelada.`}
      action={deleteVisitAction}
      submitLabel="Excluir"
      variant="destructive"
      trigger={(open) => (
        <Button variant="destructive" size="icon-sm" aria-label={`Excluir visita em ${visit.client_name}`} onClick={open}>
          <Trash2 className="size-4" />
        </Button>
      )}
    >
      <input type="hidden" name="visitId" value={visit.id} />
    </DialogForm>
  );
}
