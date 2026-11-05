"use client";

import { startTransition, useActionState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MaskedInput } from "@/components/masked-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CATALOG_UNITS } from "@/features/catalog/schemas";
import { formatCents } from "@/lib/money";
import { formatTaxRate } from "@/lib/tax";
import { paymentPlanText } from "@/lib/installments";
import { PAYMENT_METHOD_LABEL } from "@/features/expenses/schemas";
import type { PaymentMethod } from "@/types/finance";
import { saveQuoteAction } from "@/server/actions/quotes";
import type { ActionState } from "@/server/actions/action-state";
import type { CatalogItem, ClientPickerOption, PricingMode, Quote, QuoteItem } from "@/types/database";
import { useQuoteEditor, type EditorLine } from "../hooks/use-quote-editor";
import { quoteSchema } from "../schemas";

const SELECT_CLASS =
  "border-input h-11 md:h-9 w-full min-w-0 rounded-lg border bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60 dark:bg-input/30";
const TEXTAREA_CLASS =
  "border-input min-h-24 w-full rounded-lg border bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60 dark:bg-input/30";

export function QuoteEditor({
  quote,
  items,
  catalog,
  clients,
  initial,
  aside,
  canSeeCost = false,
  taxRateBps = null,
}: {
  quote: Quote | null;
  items: QuoteItem[];
  catalog: CatalogItem[];
  clients: ClientPickerOption[];
  initial: { clientId: string | null; validUntil: string | null; notes: string };
  aside?: React.ReactNode;
  /** Owner e admin: custo e acréscimo por item, que o cliente nunca vê. */
  canSeeCost?: boolean;
  /** Só para quem vê o custo: alíquota do imposto estimado; null sem regime informado. */
  taxRateBps?: number | null;
}) {
  const editor = useQuoteEditor({ quote, items, catalog, initial, canSeeCost, taxRateBps });
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
                    <li key={line.key} className="@container flex flex-col gap-3 py-4 first:pt-0 last:pb-0">
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
                            variant="destructive"
                            size="icon-sm"
                            className="mt-6"
                            aria-label={`Remover ${line.description || "item"}`}
                            onClick={() => editor.removeLine(line.key)}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        )}
                      </div>
                      <div className="grid grid-cols-2 items-end gap-3 @2xl:grid-cols-[9.5rem_repeat(3,minmax(0,1fr))_6rem]">
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
                          <MaskedInput mask="money"
                            id={`${id}-price`}
                            disabled={readOnly}
                            value={line.unitPrice}
                            onChange={(event) => editor.updateLine(line.key, { unitPrice: event.target.value })}
                          />
                        </div>
                        <div className="flex min-w-0 flex-col gap-1.5 @2xl:text-right">
                          <span className="text-sm font-medium">Total da linha</span>
                          <span className="flex h-8 items-center text-sm font-medium tabular-nums @2xl:justify-end">
                            {formatCents(editor.totals.lineTotal(line))}
                          </span>
                        </div>
                      </div>
                      {canSeeCost ? <LineCost id={id} line={line} readOnly={readOnly} editor={editor} /> : null}
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
              <Label htmlFor="quote-discount">Desconto</Label>
              <MaskedInput mask="money"
                id="quote-discount"
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
            <PaymentPlanEditor editor={editor} readOnly={readOnly} totalCents={editor.totals.total} />
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
                {editor.totals.estimate.tax !== null && taxRateBps !== null ? (
                  <div className="flex justify-between gap-2">
                    <span>Imposto estimado ({formatTaxRate(taxRateBps)})</span>
                    <span className="tabular-nums">{formatCents(editor.totals.estimate.tax)}</span>
                  </div>
                ) : null}
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
                <span>
                  Considera só os itens com custo informado.
                  {taxRateBps === null ? " Sem imposto: informe o regime da empresa em Configurações › Impostos." : null}
                </span>
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

/**
 * "A mais" da linha, numa faixa só para owner e admin. O valor digitado acima vira o custo, e o
 * cliente recebe o valor com o "a mais", sem saber que ele existe.
 */
function LineCost({
  id,
  line,
  readOnly,
  editor,
}: {
  id: string;
  line: EditorLine;
  readOnly: boolean;
  editor: ReturnType<typeof useQuoteEditor>;
}) {
  const gain = editor.totals.lineGain(line);
  return (
    <div className="mt-3 flex flex-col gap-2 rounded-xl border border-dashed bg-muted/40 p-3">
      <p className="text-xs text-muted-foreground">
        <span className="font-semibold">Só você vê.</span> Se o valor acima é o que você paga (ao parceiro, por exemplo), coloque quanto
        quer a mais. O cliente vê só o valor final.
      </p>
      <div className="grid grid-cols-1 items-end gap-3 @2xl:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor={`${id}-markup`}>A mais nesta linha</Label>
          <div className="flex gap-1">
            {line.markupMode === "amount" ? (
              <MaskedInput
                mask="money"
                id={`${id}-markup`}
                disabled={readOnly}
                value={line.markup}
                onChange={(event) => editor.updateLine(line.key, { markup: event.target.value })}
                className="min-w-0 flex-1"
              />
            ) : (
              <Input
                id={`${id}-markup`}
                inputMode="decimal"
                disabled={readOnly}
                placeholder="Ex.: 20"
                value={line.markup}
                onChange={(event) => editor.updateLine(line.key, { markup: event.target.value })}
                className="min-w-0 flex-1"
              />
            )}
            <div className="flex shrink-0 overflow-hidden rounded-lg border" role="group" aria-label="Tipo do valor a mais">
              {(["percent", "amount"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  disabled={readOnly}
                  aria-pressed={line.markupMode === mode}
                  onClick={() => editor.updateLine(line.key, { markupMode: mode, markup: "" })}
                  className={`min-w-11 px-3 text-sm ${line.markupMode === mode ? "bg-primary font-medium text-primary-foreground" : "bg-card"}`}
                >
                  {mode === "percent" ? "%" : "R$"}
                </button>
              ))}
            </div>
          </div>
        </div>
        <p className="rounded-lg bg-background px-3 py-2 text-sm @2xl:bg-transparent @2xl:px-0 @2xl:py-1.5">
          {gain === null ? (
            <span className="text-muted-foreground">Sem valor a mais: o cliente vê o valor digitado acima.</span>
          ) : (
            <>
              <span className="text-muted-foreground">O cliente vê </span>
              <strong className="tabular-nums">{formatCents(editor.totals.clientUnitPrice(line))}</strong>
              <span className="text-muted-foreground"> por unidade. Você ganha </span>
              <strong className={`tabular-nums ${gain.cents < 0 ? "text-destructive" : "text-success"}`}>{formatCents(gain.cents)}</strong>
              {gain.margin !== null ? <span className="text-muted-foreground"> ({gain.margin}% do preço)</span> : null}
            </>
          )}
        </p>
      </div>
    </div>
  );
}

const METHOD_OPTIONS = Object.entries(PAYMENT_METHOD_LABEL) as [PaymentMethod, string][];

function MethodSelect({ id, value, onChange, disabled }: { id: string; value: PaymentMethod | null; onChange: (value: PaymentMethod | null) => void; disabled: boolean }) {
  return (
    <select id={id} disabled={disabled} value={value ?? ""} onChange={(event) => onChange((event.target.value || null) as PaymentMethod | null)} className={SELECT_CLASS}>
      <option value="">Não informada</option>
      {METHOD_OPTIONS.map(([method, label]) => (
        <option key={method} value={method}>
          {label}
        </option>
      ))}
    </select>
  );
}

/** Condições de pagamento combinadas: o cliente vê no link e no PDF, e o fechamento já vem preenchido. */
function PaymentPlanEditor({ editor, readOnly, totalCents }: { editor: ReturnType<typeof useQuoteEditor>; readOnly: boolean; totalCents: number }) {
  const { plan } = editor;
  const preview = editor.toInput().paymentPlan;
  const text = preview && preview.entry_cents >= 0 && preview.count >= 1 ? paymentPlanText(preview, totalCents) : null;
  return (
    <div className="flex flex-col gap-3 border-t pt-4">
      <div className="flex flex-col gap-1.5 sm:max-w-64">
        <Label htmlFor="quote-plan">Condições de pagamento</Label>
        <select
          id="quote-plan"
          disabled={readOnly}
          value={plan.kind}
          onChange={(event) => plan.setKind(event.target.value as typeof plan.kind)}
          className={SELECT_CLASS}
        >
          <option value="">A combinar</option>
          <option value="cash">À vista</option>
          <option value="entry">Entrada + parcelas</option>
          <option value="card">Cartão parcelado</option>
        </select>
      </div>
      {plan.kind === "cash" ? (
        <div className="flex flex-col gap-1.5 sm:max-w-64">
          <Label htmlFor="quote-plan-method">Forma</Label>
          <MethodSelect id="quote-plan-method" value={plan.method} onChange={plan.setMethod} disabled={readOnly} />
        </div>
      ) : null}
      {plan.kind === "entry" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="quote-plan-entry">Entrada (R$)</Label>
            <MaskedInput mask="money" id="quote-plan-entry" disabled={readOnly} value={plan.entry} onChange={(event) => plan.setEntry(event.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="quote-plan-entry-method">Forma da entrada</Label>
            <MethodSelect id="quote-plan-entry-method" value={plan.entryMethod} onChange={plan.setEntryMethod} disabled={readOnly} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="quote-plan-count">Restante em quantas vezes</Label>
            <Input id="quote-plan-count" type="number" min={1} max={60} disabled={readOnly} value={plan.count} onChange={(event) => plan.setCount(event.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="quote-plan-rest-method">Forma do restante</Label>
            <MethodSelect id="quote-plan-rest-method" value={plan.method} onChange={plan.setMethod} disabled={readOnly} />
          </div>
        </div>
      ) : null}
      {plan.kind === "card" ? (
        <div className="flex flex-col gap-1.5 sm:max-w-40">
          <Label htmlFor="quote-plan-card">Em quantas vezes</Label>
          <Input id="quote-plan-card" type="number" min={1} max={60} disabled={readOnly} value={plan.count} onChange={(event) => plan.setCount(event.target.value)} />
        </div>
      ) : null}
      {text ? <p className="rounded-lg bg-muted px-3 py-2 text-sm">O cliente vê: <strong>{text}</strong></p> : null}
    </div>
  );
}
