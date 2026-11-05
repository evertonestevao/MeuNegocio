"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { DialogForm } from "@/components/dialog-form";
import { MaskedInput } from "@/components/masked-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PAYMENT_METHOD_LABEL } from "@/features/expenses/schemas";
import { formatDate } from "@/lib/dates";
import { buildInstallments, defaultPaymentPlan, MAX_INSTALLMENTS, type PaymentPlan, type PaymentPlanKind } from "@/lib/installments";
import { centsToMoneyInput, formatCents, parseMoneyToCents } from "@/lib/money";
import { closeQuoteAction } from "@/server/actions/quotes";
import type { InstallmentInput, PaymentMethod } from "@/types/finance";
import { closeQuoteSchema } from "../schemas";

const SELECT_CLASS =
  "border-input h-11 w-full rounded-lg border bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:h-9 dark:bg-input/30";

const KINDS: { kind: PaymentPlanKind; label: string }[] = [
  { kind: "cash", label: "À vista" },
  { kind: "entry", label: "Entrada + parcelas" },
  { kind: "card", label: "Cartão parcelado" },
  { kind: "custom", label: "Personalizado" },
];

const METHODS = Object.entries(PAYMENT_METHOD_LABEL) as [PaymentMethod, string][];

function MethodSelect({ id, value, onChange }: { id: string; value: PaymentMethod | null; onChange: (value: PaymentMethod | null) => void }) {
  return (
    <select id={id} value={value ?? ""} onChange={(event) => onChange((event.target.value || null) as PaymentMethod | null)} className={SELECT_CLASS}>
      <option value="">Não informada</option>
      {METHODS.map(([method, label]) => (
        <option key={method} value={method}>
          {label}
        </option>
      ))}
    </select>
  );
}

interface CustomRow {
  key: number;
  amount: string;
  dueDate: string;
  method: PaymentMethod | null;
  received: boolean;
}

let nextKey = 0;

/** Como o cliente vai pagar: o faturamento entra inteiro no fechamento; o caixa, parcela a parcela. */
function PaymentPlanFields({ quoteId, totalCents, today }: { quoteId: string; totalCents: number; today: string }) {
  const [amount, setAmount] = useState(centsToMoneyInput(totalCents));
  const [plan, setPlan] = useState<PaymentPlan>(() => defaultPaymentPlan(today));
  const [entry, setEntry] = useState("");
  const [rows, setRows] = useState<CustomRow[]>([]);
  const amountCents = parseMoneyToCents(amount) ?? 0;
  const update = (changes: Partial<PaymentPlan>) => setPlan((current) => ({ ...current, ...changes }));

  const installments: InstallmentInput[] = useMemo(() => {
    if (plan.kind !== "custom") return buildInstallments(amountCents, { ...plan, entryCents: parseMoneyToCents(entry) ?? 0 }, today);
    return rows.map((row) => ({ amount_cents: parseMoneyToCents(row.amount) ?? 0, due_date: row.dueDate, method: row.method, received: row.received }));
  }, [plan, amountCents, entry, rows, today]);
  const missing = amountCents - installments.reduce((sum, item) => sum + item.amount_cents, 0);

  function choose(kind: PaymentPlanKind) {
    if (kind === "custom" && rows.length === 0) {
      // Começa do que estava montado, para só ajustar.
      const base = installments.length > 0 ? installments : buildInstallments(amountCents, defaultPaymentPlan(today), today);
      setRows(base.map((item) => ({ key: nextKey++, amount: centsToMoneyInput(item.amount_cents), dueDate: item.due_date, method: item.method, received: item.received })));
    }
    update({ kind });
  }

  const setRow = (key: number, changes: Partial<CustomRow>) => setRows((current) => current.map((row) => (row.key === key ? { ...row, ...changes } : row)));

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`close-amount-${quoteId}`}>Valor (R$)</Label>
          <MaskedInput mask="money" id={`close-amount-${quoteId}`} name="amount" value={amount} onChange={(event) => setAmount(event.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`close-date-${quoteId}`}>Data de competência</Label>
          <Input id={`close-date-${quoteId}`} name="competenceDate" type="date" defaultValue={today} />
        </div>
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1.5 text-sm font-medium">Como o cliente vai pagar</legend>
        <div className="grid grid-cols-2 gap-2">
          {KINDS.map((option) => (
            <label key={option.kind} className="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5">
              <input type="radio" name={`plan-${quoteId}`} checked={plan.kind === option.kind} onChange={() => choose(option.kind)} />
              {option.label}
            </label>
          ))}
        </div>

        {plan.kind === "cash" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`close-method-${quoteId}`}>Forma</Label>
              <MethodSelect id={`close-method-${quoteId}`} value={plan.method} onChange={(method) => update({ method })} />
            </div>
            <label className="flex items-center gap-2 self-end pb-2 text-sm">
              <input type="checkbox" checked={plan.receivedNow} onChange={(event) => update({ receivedNow: event.target.checked })} />
              Já recebido
            </label>
          </div>
        ) : null}

        {plan.kind === "entry" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`close-entry-${quoteId}`}>Entrada (R$)</Label>
              <MaskedInput mask="money" id={`close-entry-${quoteId}`} value={entry} onChange={(event) => setEntry(event.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`close-entry-method-${quoteId}`}>Forma da entrada</Label>
              <MethodSelect id={`close-entry-method-${quoteId}`} value={plan.entryMethod} onChange={(entryMethod) => update({ entryMethod })} />
            </div>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" checked={plan.receivedNow} onChange={(event) => update({ receivedNow: event.target.checked })} />
              A entrada já foi recebida
            </label>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`close-count-${quoteId}`}>Restante em quantas vezes</Label>
              <Input id={`close-count-${quoteId}`} type="number" min={1} max={MAX_INSTALLMENTS} value={plan.count} onChange={(event) => update({ count: Number(event.target.value) || 1 })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`close-rest-method-${quoteId}`}>Forma do restante</Label>
              <MethodSelect id={`close-rest-method-${quoteId}`} value={plan.method} onChange={(method) => update({ method })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`close-first-${quoteId}`}>Primeira parcela em</Label>
              <Input id={`close-first-${quoteId}`} type="date" value={plan.firstDueDate} onChange={(event) => update({ firstDueDate: event.target.value })} />
            </div>
          </div>
        ) : null}

        {plan.kind === "card" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`close-card-count-${quoteId}`}>Em quantas vezes</Label>
              <Input id={`close-card-count-${quoteId}`} type="number" min={1} max={MAX_INSTALLMENTS} value={plan.count} onChange={(event) => update({ count: Number(event.target.value) || 1 })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`close-card-first-${quoteId}`}>Primeiro repasse em</Label>
              <Input id={`close-card-first-${quoteId}`} type="date" value={plan.firstDueDate} onChange={(event) => update({ firstDueDate: event.target.value })} />
            </div>
            <p className="text-xs text-muted-foreground sm:col-span-2">Cada parcela entra no caixa quando a maquininha repassa, um mês depois da outra.</p>
          </div>
        ) : null}

        {plan.kind === "custom" ? (
          <div className="flex flex-col gap-3">
            {rows.map((row, index) => (
              <div key={row.key} className="grid grid-cols-2 gap-2 rounded-lg border p-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
                <MaskedInput mask="money" aria-label={`Valor da parcela ${index + 1}`} value={row.amount} onChange={(event) => setRow(row.key, { amount: event.target.value })} />
                <Input type="date" aria-label={`Vencimento da parcela ${index + 1}`} value={row.dueDate} onChange={(event) => setRow(row.key, { dueDate: event.target.value })} />
                <MethodSelect id={`close-row-method-${row.key}`} value={row.method} onChange={(method) => setRow(row.key, { method })} />
                <div className="flex items-center justify-between gap-2">
                  <label className="flex items-center gap-1.5 text-xs">
                    <input type="checkbox" checked={row.received} onChange={(event) => setRow(row.key, { received: event.target.checked })} />
                    Recebida
                  </label>
                  <Button type="button" size="icon-sm" variant="ghost" aria-label={`Tirar a parcela ${index + 1}`} onClick={() => setRows((current) => current.filter((item) => item.key !== row.key))}>
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="self-start"
              disabled={rows.length >= MAX_INSTALLMENTS}
              onClick={() => setRows((current) => [...current, { key: nextKey++, amount: missing > 0 ? centsToMoneyInput(missing) : "", dueDate: today, method: null, received: false }])}
            >
              <Plus className="size-4" /> Parcela
            </Button>
          </div>
        ) : null}
      </fieldset>

      {plan.kind !== "custom" && installments.length > 0 ? (
        <ul className="flex flex-col divide-y rounded-lg bg-muted/60 px-3 py-1 text-xs">
          {installments.map((item, index) => (
            <li key={index} className="flex justify-between gap-2 py-1.5">
              <span>
                {formatDate(item.due_date)} · {item.method ? PAYMENT_METHOD_LABEL[item.method] : "forma não informada"}
                {item.received ? " · recebido" : " · a receber"}
              </span>
              <span className="font-medium tabular-nums">{formatCents(item.amount_cents)}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {missing !== 0 && amountCents > 0 ? (
        <p className="text-sm text-destructive">
          {missing > 0 ? `Faltam ${formatCents(missing)} nas parcelas.` : `As parcelas passam ${formatCents(-missing)} do valor.`}
        </p>
      ) : null}
      <input type="hidden" name="installments" value={JSON.stringify(installments)} />
    </>
  );
}

/** Fecha o orçamento aprovado: o serviço termina, o valor entra no faturamento e as parcelas, em contas a receber. */
export function CloseQuoteButton({
  quoteId,
  totalCents,
  today,
  label = "Fechar e faturar",
  className,
}: {
  quoteId: string;
  totalCents: number;
  today: string;
  label?: string;
  className?: string;
}) {
  return (
    <DialogForm
      title={label}
      description="O valor entra no faturamento na data de competência. O que ainda não foi pago fica em contas a receber."
      action={closeQuoteAction}
      validate={(data) =>
        closeQuoteSchema.parse({
          amountCents: parseMoneyToCents(String(data.get("amount") ?? "")) ?? undefined,
          competenceDate: data.get("competenceDate"),
          installments: JSON.parse(String(data.get("installments") ?? "[]")),
        })
      }
      submitLabel={label}
      trigger={(open) => (
        <Button onClick={open} className={className}>
          {label}
        </Button>
      )}
    >
      <input type="hidden" name="quoteId" value={quoteId} />
      <PaymentPlanFields quoteId={quoteId} totalCents={totalCents} today={today} />
    </DialogForm>
  );
}
