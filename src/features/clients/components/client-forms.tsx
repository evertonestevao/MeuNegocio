"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MaskedInput } from "@/components/masked-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { parseClientForm, parseContactForm, parseLocationForm } from "@/features/clients/schemas";
import {
  createClientAction,
  deleteClientAction,
  removeContactAction,
  removeLocationAction,
  saveContactAction,
  saveLocationAction,
  updateClientAction,
} from "@/server/actions/clients";
import type { Client, ClientContact, ClientLocation } from "@/types/database";
import { DialogForm } from "@/components/dialog-form";

const TEXTAREA_CLASS =
  "border-input min-h-20 w-full rounded-lg border bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function ClientFields({ client }: { client?: Client }) {
  return (
    <>
      <Field id="client-name" label="Nome">
        <Input id="client-name" name="name" defaultValue={client?.name ?? ""} autoFocus />
      </Field>
      <Field id="client-document" label="CNPJ ou CPF">
        <MaskedInput mask="cpfCnpj" id="client-document" name="document" defaultValue={client?.document ?? ""} />
      </Field>
      <Field id="client-notes" label="Observações" hint="Regras de acesso, prazos de pagamento, preferências do cliente.">
        <textarea id="client-notes" name="notes" defaultValue={client?.notes ?? ""} className={TEXTAREA_CLASS} />
      </Field>
    </>
  );
}

export function NewClientButton() {
  return (
    <DialogForm
      title="Novo cliente"
      description="Contatos e locais de atendimento você adiciona na tela do cliente."
      action={createClientAction}
      validate={parseClientForm}
      submitLabel="Salvar cliente"
      trigger={(open) => (
        <Button onClick={open}>
          <Plus className="size-4" /> Novo cliente
        </Button>
      )}
    >
      <ClientFields />
    </DialogForm>
  );
}

export function EditClientButton({ client }: { client: Client }) {
  return (
    <DialogForm
      title="Editar cliente"
      action={updateClientAction}
      validate={parseClientForm}
      submitLabel="Salvar cliente"
      trigger={(open) => (
        <Button variant="outline" onClick={open}>
          <Pencil className="size-4" /> Editar
        </Button>
      )}
    >
      <input type="hidden" name="clientId" value={client.id} />
      <ClientFields client={client} />
    </DialogForm>
  );
}

export function DeleteClientButton({ client }: { client: Client }) {
  return (
    <DialogForm
      title="Excluir cliente"
      description={`Excluir ${client.name}? Essa ação não pode ser desfeita pelo sistema.`}
      action={deleteClientAction}
      submitLabel="Excluir cliente"
      variant="destructive"
      trigger={(open) => (
        <Button variant="outline" className="text-destructive" onClick={open}>
          <Trash2 className="size-4" /> Excluir cliente
        </Button>
      )}
    >
      <input type="hidden" name="clientId" value={client.id} />
    </DialogForm>
  );
}

export function ContactFormButton({ clientId, contact }: { clientId: string; contact?: ClientContact }) {
  const prefix = contact?.id ?? "new-contact";
  return (
    <DialogForm
      title={contact ? "Editar contato" : "Novo contato"}
      action={saveContactAction}
      validate={parseContactForm}
      submitLabel="Salvar contato"
      trigger={(open) =>
        contact ? (
          <Button variant="ghost" size="icon-sm" aria-label={`Editar ${contact.name}`} onClick={open}>
            <Pencil className="size-4" />
          </Button>
        ) : (
          <Button variant="outline" size="sm" onClick={open}>
            <Plus className="size-4" /> Adicionar
          </Button>
        )
      }
    >
      <input type="hidden" name="clientId" value={clientId} />
      {contact ? <input type="hidden" name="contactId" value={contact.id} /> : null}
      <Field id={`${prefix}-name`} label="Nome">
        <Input id={`${prefix}-name`} name="name" defaultValue={contact?.name ?? ""} autoFocus />
      </Field>
      <Field id={`${prefix}-role`} label="Função">
        <Input id={`${prefix}-role`} name="role" defaultValue={contact?.role ?? ""} />
      </Field>
      <Field id={`${prefix}-phone`} label="Telefone">
        <MaskedInput mask="phone" id={`${prefix}-phone`} name="phone" defaultValue={contact?.phone ?? ""} />
      </Field>
      <Field id={`${prefix}-email`} label="E-mail">
        <Input id={`${prefix}-email`} name="email" type="email" defaultValue={contact?.email ?? ""} />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isPrimary" defaultChecked={contact?.is_primary ?? false} className="size-4" />
        Contato principal
      </label>
    </DialogForm>
  );
}

export function RemoveContactButton({ clientId, contact }: { clientId: string; contact: ClientContact }) {
  return (
    <DialogForm
      title="Remover contato"
      description={`Remover o contato ${contact.name}?`}
      action={removeContactAction}
      submitLabel="Remover"
      variant="destructive"
      trigger={(open) => (
        <Button variant="ghost" size="icon-sm" aria-label={`Remover ${contact.name}`} onClick={open}>
          <Trash2 className="size-4" />
        </Button>
      )}
    >
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="contactId" value={contact.id} />
    </DialogForm>
  );
}

export function LocationFormButton({ clientId, location }: { clientId: string; location?: ClientLocation }) {
  const prefix = location?.id ?? "new-location";
  return (
    <DialogForm
      title={location ? "Editar local" : "Novo local"}
      action={saveLocationAction}
      validate={parseLocationForm}
      submitLabel="Salvar local"
      trigger={(open) =>
        location ? (
          <Button variant="ghost" size="icon-sm" aria-label={`Editar ${location.name}`} onClick={open}>
            <Pencil className="size-4" />
          </Button>
        ) : (
          <Button variant="outline" size="sm" onClick={open}>
            <Plus className="size-4" /> Adicionar
          </Button>
        )
      }
    >
      <input type="hidden" name="clientId" value={clientId} />
      {location ? <input type="hidden" name="locationId" value={location.id} /> : null}
      <Field id={`${prefix}-name`} label="Nome do local" hint="Ex.: Fábrica, Unidade Centro">
        <Input id={`${prefix}-name`} name="name" defaultValue={location?.name ?? ""} autoFocus />
      </Field>
      <Field id={`${prefix}-address`} label="Endereço completo">
        <Input id={`${prefix}-address`} name="address" defaultValue={location?.address ?? ""} />
      </Field>
      <Field id={`${prefix}-notes`} label="Observações">
        <textarea id={`${prefix}-notes`} name="notes" defaultValue={location?.notes ?? ""} className={TEXTAREA_CLASS} />
      </Field>
    </DialogForm>
  );
}

export function RemoveLocationButton({ clientId, location }: { clientId: string; location: ClientLocation }) {
  return (
    <DialogForm
      title="Remover local"
      description={`Remover o local ${location.name}?`}
      action={removeLocationAction}
      submitLabel="Remover"
      variant="destructive"
      trigger={(open) => (
        <Button variant="ghost" size="icon-sm" aria-label={`Remover ${location.name}`} onClick={open}>
          <Trash2 className="size-4" />
        </Button>
      )}
    >
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="locationId" value={location.id} />
    </DialogForm>
  );
}
