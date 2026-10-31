"use client";

import { startTransition, useActionState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CATALOG_UNITS } from "@/features/catalog/schemas";
import { formatCents } from "@/lib/money";
import { saveQuoteAction } from "@/server/actions/quotes";
import type { ActionState } from "@/server/actions/action-state";
import type { CatalogItem, ClientPickerOption, PricingMode, Quote, QuoteItem } from "@/types/database";
import { useQuoteEditor } from "../hooks/use-quote-editor";
import { quoteSchema } from "../schemas";

const SELECT_CLASS =
  "border-input h-8 w-full min-w-0 rounded-lg border bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60 dark:bg-input/30";
const TEXTAREA_CLASS =
  "border-input min-h-24 w-full rounded-lg border bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60 dark:bg-input/30";

export function QuoteEditor({
  quote,
  items,
  catalog,
  clients,
  initial,
  aside,
}: {
  quote: Quote | null;
  items: QuoteItem[];
  catalog: CatalogItem[];
  clients: ClientPickerOption[];
  initial: { clientId: string | null; validUntil: string | null; notes: string };
  aside?: React.ReactNode;
}) {
  const editor = useQuoteEditor({ quote, items, catalog, initial });
  const readOnly = quote !== null && quote.status !== "draft";
  const client = clients.find((candidate) => candidate.id === editor.clientId);
  const activeCatalog = catalog.filter((item) => item.active);

  const [state, dispatch, pending] = useActionState(
    async (prev: ActionState | undefined, data: FormData): Promise<ActionState> => {
      const parsed = quoteSchema.safeParse(JSON.parse(String(data.get("payload"))));
      if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
      const result = await saveQuoteAction(prev, data);
      if (result?.success) toast.success(result.success);
      return result;
    },
    undefined,
  );

  function save() {
    const data = new FormData();
    if (quote) data.set("quoteId", quote.id);
    data.set("payload", JSON.stringify(editor.toInput()));
    startTransition(() => dispatch(data));
  }

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="flex min-w-0 flex-col gap-4">
        {state?.error ? (
          <Alert variant="destructive">
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Dados</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="quote-client">Cliente</Label>
              <select
                id="quote-client"
                className={SELECT_CLASS}
                disabled={readOnly}
                value={editor.clientId ?? ""}
                onChange={(event) => editor.chooseClient(event.target.value || null)}
              >
                <option value="">Escolha o cliente</option>
                {clients.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="quote-location">Local do serviço</Label>
              <select
                id="quote-location"
                className={SELECT_CLASS}
                disabled={readOnly || !client}
                value={editor.locationId ?? ""}
                onChange={(event) => editor.setLocationId(event.target.value || null)}
              >
                <option value="">Sem local definido</option>
                {client?.locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="quote-title">Título do serviço</Label>
              <Input
                id="quote-title"
                disabled={readOnly}
                value={editor.title}
                onChange={(event) => editor.setTitle(event.target.value)}
              />
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="quote-valid">Válido até</Label>
              <Input
                id="quote-valid"
                type="date"
                disabled={readOnly}
                value={editor.validUntil}
                onChange={(event) => editor.setValidUntil(event.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Itens</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {editor.lines.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum item ainda.</p>
            ) : (
              <ul className="flex flex-col divide-y">
                {editor.lines.map((line, index) => {
                  const hourly = line.pricingMode === "hourly";
                  const id = `line-${index}`;
                  return (
                    <li key={line.key} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0">
                      <div className="flex items-start gap-2">
                        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                          <Label htmlFor={`${id}-description`}>Descrição</Label>
                          <Input
                            id={`${id}-description`}
                            disabled={readOnly}
                            value={line.description}
                            onChange={(event) => editor.updateLine(line.key, { description: event.target.value })}
                          />
                        </div>
                        {readOnly ? null : (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="mt-6"
                            aria-label={`Remover ${line.description || "item"}`}
                            onClick={() => editor.removeLine(line.key)}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        )}
                      </div>
                      <div className="grid grid-cols-2 items-end gap-3 sm:grid-cols-[9.5rem_repeat(3,minmax(0,1fr))_6rem]">
                        <div className="flex min-w-0 flex-col gap-1.5">
                          <Label htmlFor={`${id}-mode`}>Cobrança</Label>
                          <select
                            id={`${id}-mode`}
                            className={SELECT_CLASS}
                            disabled={readOnly}
                            value={line.pricingMode}
                            onChange={(event) => editor.updateLine(line.key, { pricingMode: event.target.value as PricingMode })}
                          >
                            <option value="fixed">Preço fechado</option>
                            <option value="hourly">Por hora</option>
                          </select>
                        </div>
                        <div className="flex min-w-0 flex-col gap-1.5">
                          <Label htmlFor={`${id}-quantity`}>{hourly ? "Horas" : `Quantidade (${line.unit})`}</Label>
                          <Input
                            id={`${id}-quantity`}
                            inputMode="decimal"
                            disabled={readOnly}
                            value={line.quantity}
                            onChange={(event) => editor.updateLine(line.key, { quantity: event.target.value })}
                          />
                        </div>
                        {hourly ? (
                          <div className="flex min-w-0 flex-col gap-1.5">
                            <Label htmlFor={`${id}-people`}>Pessoas</Label>
                            <Input
                              id={`${id}-people`}
                              inputMode="numeric"
                              disabled={readOnly}
                              value={line.people}
                              onChange={(event) => editor.updateLine(line.key, { people: event.target.value })}
                            />
                          </div>
                        ) : (
                          <div className="flex min-w-0 flex-col gap-1.5">
                            <Label htmlFor={`${id}-unit`}>Unidade</Label>
                            <select
                              id={`${id}-unit`}
                              className={SELECT_CLASS}
                              disabled={readOnly}
                              value={line.unit}
                              onChange={(event) => editor.updateLine(line.key, { unit: event.target.value })}
                            >
                              {[...new Set<string>([line.unit, ...CATALOG_UNITS])].map((unit) => (
                                <option key={unit} value={unit}>
                                  {unit}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                        <div className="flex min-w-0 flex-col gap-1.5">
                          <Label htmlFor={`${id}-price`}>{hourly ? "Valor por hora" : "Valor unitário"}</Label>
                          <Input
                            id={`${id}-price`}
                            inputMode="decimal"
                            disabled={readOnly}
                            value={line.unitPrice}
                            onChange={(event) => editor.updateLine(line.key, { unitPrice: event.target.value })}
                          />
                        </div>
                        <div className="flex min-w-0 flex-col gap-1.5 sm:text-right">
                          <span className="text-sm font-medium">Total da linha</span>
                          <span className="flex h-8 items-center text-sm font-medium tabular-nums sm:justify-end">
                            {formatCents(editor.totals.lineTotal(line))}
                          </span>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            {readOnly ? null : (
              <div className="flex flex-wrap gap-2">
                <select
                  aria-label="Adicionar do catálogo"
                  className={`${SELECT_CLASS} max-w-sm`}
                  value=""
                  onChange={(event) => editor.addFromCatalog(event.target.value)}
                >
                  <option value="">Adicionar do catálogo…</option>
                  {activeCatalog.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} — {formatCents(item.price_cents)}
                      {item.pricing_mode === "hourly" ? "/h" : ""}
                    </option>
                  ))}
                </select>
                <Button variant="outline" size="sm" onClick={editor.addCustom}>
                  <Plus className="size-4" /> Item avulso
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Desconto e condições</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex max-w-40 flex-col gap-1.5">
              <Label htmlFor="quote-discount">Desconto (R$)</Label>
              <Input
                id="quote-discount"
                inputMode="decimal"
                disabled={readOnly}
                value={editor.discount}
                onChange={(event) => editor.setDiscount(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="quote-notes">Observações e condições (aparecem no PDF)</Label>
              <textarea
                id="quote-notes"
                className={TEXTAREA_CLASS}
                disabled={readOnly}
                value={editor.notes}
                onChange={(event) => editor.setNotes(event.target.value)}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-18">
        <Card>
          <CardContent className="flex flex-col gap-3 text-sm">
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="tabular-nums">{formatCents(editor.totals.subtotal)}</span>
            </div>
            <div className="flex justify-between gap-2 text-base font-semibold">
              <span>Total</span>
              <span className="tabular-nums">{formatCents(editor.totals.total)}</span>
            </div>
            {editor.totals.estimate ? (
              <div className="flex flex-col gap-1 border-t pt-3 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Só você vê (não vai no PDF)</span>
                <div className="flex justify-between gap-2">
                  <span>Custo estimado</span>
                  <span className="tabular-nums">{formatCents(editor.totals.estimate.cost)}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span>Lucro estimado</span>
                  <span className="tabular-nums">{formatCents(editor.totals.estimate.profit)}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span>Margem</span>
                  <span className="tabular-nums">
                    {editor.totals.estimate.margin === null ? "—" : `${editor.totals.estimate.margin}%`}
                  </span>
                </div>
                <span>Considera só os itens com custo no catálogo.</span>
              </div>
            ) : null}
            {readOnly ? null : (
              <Button disabled={pending} onClick={save}>
                {pending ? "Salvando..." : "Salvar rascunho"}
              </Button>
            )}
          </CardContent>
        </Card>
        {aside}
      </div>
    </div>
  );
}
