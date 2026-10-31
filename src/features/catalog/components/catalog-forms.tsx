"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { DialogForm } from "@/components/dialog-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CATALOG_UNITS, parseCatalogForm } from "@/features/catalog/schemas";
import { centsToMoneyInput, parseMoneyToCents } from "@/lib/money";
import { marginPercent } from "@/lib/quoteCalc";
import { deleteCatalogItemAction, saveCatalogItemAction } from "@/server/actions/catalog";
import type { CatalogItem, CatalogKind, PricingMode } from "@/types/database";

const SELECT_CLASS =
  "border-input h-8 w-full rounded-lg border bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function CatalogFields({ item, kind }: { item?: CatalogItem; kind: CatalogKind }) {
  const prefix = item?.id ?? `new-${kind}`;
  const [mode, setMode] = useState<PricingMode>(item?.pricing_mode ?? "fixed");
  const [price, setPrice] = useState(item ? centsToMoneyInput(item.price_cents) : "");
  const [cost, setCost] = useState(item?.cost_cents != null ? centsToMoneyInput(item.cost_cents) : "");
  const priceCents = parseMoneyToCents(price);
  const costCents = parseMoneyToCents(cost);
  const margin = priceCents !== null && costCents ? marginPercent(priceCents, costCents) : null;
  const hourly = mode === "hourly";

  return (
    <>
      <input type="hidden" name="kind" value={kind} />
      {item ? <input type="hidden" name="itemId" value={item.id} /> : null}
      <Field id={`${prefix}-name`} label="Nome">
        <Input id={`${prefix}-name`} name="name" defaultValue={item?.name ?? ""} autoFocus />
      </Field>
      <Field id={`${prefix}-description`} label="Descrição">
        <Input id={`${prefix}-description`} name="description" defaultValue={item?.description ?? ""} />
      </Field>
      {kind === "service" ? (
        <Field id={`${prefix}-mode`} label="Como cobrar">
          <select
            id={`${prefix}-mode`}
            name="pricingMode"
            value={mode}
            onChange={(event) => setMode(event.target.value as PricingMode)}
            className={SELECT_CLASS}
          >
            <option value="fixed">Preço fechado</option>
            <option value="hourly">Por hora</option>
          </select>
        </Field>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-3">
        <Field id={`${prefix}-unit`} label="Unidade">
          {hourly ? <input type="hidden" name="unit" value="h" /> : null}
          <select
            id={`${prefix}-unit`}
            name={hourly ? undefined : "unit"}
            disabled={hourly}
            value={hourly ? "h" : undefined}
            defaultValue={hourly ? undefined : (item?.unit ?? (kind === "product" ? "un" : "visita"))}
            className={SELECT_CLASS}
          >
            {CATALOG_UNITS.map((unit) => (
              <option key={unit} value={unit}>
                {unit}
              </option>
            ))}
          </select>
        </Field>
        <Field id={`${prefix}-price`} label={hourly ? "Preço por hora" : "Preço de venda"}>
          <Input
            id={`${prefix}-price`}
            name="price"
            inputMode="decimal"
            value={price}
            onChange={(event) => setPrice(event.target.value)}
          />
        </Field>
        <Field id={`${prefix}-cost`} label={hourly ? "Custo por hora" : "Custo"}>
          <Input
            id={`${prefix}-cost`}
            name="cost"
            inputMode="decimal"
            value={cost}
            onChange={(event) => setCost(event.target.value)}
          />
        </Field>
      </div>
      <p className="text-xs text-muted-foreground">
        {margin === null ? "Informe o custo para ver a margem." : `Margem de ${margin}%.`} O custo é opcional e nunca aparece
        no PDF.
      </p>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="active" defaultChecked={item?.active ?? true} className="size-4" />
        Ativo (aparece ao montar orçamentos)
      </label>
    </>
  );
}

export function NewCatalogItemButton({ kind }: { kind: CatalogKind }) {
  const label = kind === "product" ? "Novo produto" : "Novo serviço";
  return (
    <DialogForm
      title={label}
      action={saveCatalogItemAction}
      validate={parseCatalogForm}
      submitLabel="Salvar"
      trigger={(open) => (
        <Button onClick={open}>
          <Plus className="size-4" /> {label}
        </Button>
      )}
    >
      <CatalogFields kind={kind} />
    </DialogForm>
  );
}

export function EditCatalogItemButton({ item }: { item: CatalogItem }) {
  return (
    <DialogForm
      title={`Editar ${item.name}`}
      description="Orçamentos já criados guardam os valores deles e não mudam."
      action={saveCatalogItemAction}
      validate={parseCatalogForm}
      submitLabel="Salvar"
      trigger={(open) => (
        <Button variant="ghost" size="icon-sm" aria-label={`Editar ${item.name}`} onClick={open}>
          <Pencil className="size-4" />
        </Button>
      )}
    >
      <CatalogFields item={item} kind={item.kind} />
    </DialogForm>
  );
}

export function DeleteCatalogItemButton({ item }: { item: CatalogItem }) {
  return (
    <DialogForm
      title="Excluir item"
      description={`Excluir ${item.name}? Orçamentos já criados não mudam.`}
      action={deleteCatalogItemAction}
      submitLabel="Excluir"
      variant="destructive"
      trigger={(open) => (
        <Button variant="ghost" size="icon-sm" aria-label={`Excluir ${item.name}`} onClick={open}>
          <Trash2 className="size-4" />
        </Button>
      )}
    >
      <input type="hidden" name="itemId" value={item.id} />
    </DialogForm>
  );
}
