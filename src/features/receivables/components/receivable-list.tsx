"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { CalendarClock, Check, FileText, HandCoins, MessageCircle, Undo2 } from "lucide-react";
import { ActionButton } from "@/components/action-button";
import { DialogForm } from "@/components/dialog-form";
import { MaskedInput } from "@/components/masked-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PAYMENT_METHOD_LABEL } from "@/features/expenses/schemas";
import { formatQuoteNumber } from "@/features/quotes/status";
import { addDays, formatDate } from "@/lib/dates";
import { anticipationCents, expectedCents, receivableStatus } from "@/lib/installments";
import { parseTaxRate } from "@/lib/tax";
import { whatsappUrl } from "@/features/quotes/pdf";
import { reminderText } from "../reminder";
import { centsToMoneyInput, formatCents, parseMoneyToCents } from "@/lib/money";
import { getReceiptAction, receiveInstallmentAction, rescheduleInstallmentAction, undoReceiveInstallmentAction } from "@/server/actions/receivables";
import { shareReceiptPdf } from "../receipt-pdf";
import type { PaymentMethod, Receivable } from "@/types/finance";

const SELECT_CLASS =
  "border-input h-11 w-full rounded-lg border bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:h-9 dark:bg-input/30";

const METHODS = Object.entries(PAYMENT_METHOD_LABEL) as [PaymentMethod, string][];

/**
 * Botões de ação da parcela. No celular não existe "passar o mouse", então o texto fica ao lado do
 * ícone; a partir de 640px (sm) viram só o ícone, com a legenda no `title` ao passar o mouse.
 */
const ICON_ACTION = "sm:w-9 sm:px-0 md:w-7";
function ActionLabel({ children }: { children: React.ReactNode }) {
  return <span className="sm:hidden">{children}</span>;
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
}

function statusText(item: Receivable, today: string): { text: string; tone: string } {
  const status = receivableStatus(item, today);
  if (status === "received") return { text: `Recebida em ${formatDate(item.received_on)}`, tone: "text-success" };
  if (status === "overdue") {
    const days = daysBetween(item.due_date, today);
    return { text: `Atrasada há ${days} ${days === 1 ? "dia" : "dias"}`, tone: "text-destructive" };
  }
  if (status === "due_today") return { text: "Vence hoje", tone: "text-warning" };
  return { text: `Vence em ${formatDate(item.due_date)}`, tone: "text-muted-foreground" };
}

function MethodSelect({ id, value }: { id: string; value: PaymentMethod | null }) {
  return (
    <select id={id} name="method" defaultValue={value ?? ""} className={SELECT_CLASS}>
      <option value="">Não informada</option>
      {METHODS.map(([method, label]) => (
        <option key={method} value={method}>
          {label}
        </option>
      ))}
    </select>
  );
}

/**
 * Recebido com um toque: o valor esperado (já sem a taxa), hoje, na forma combinada. É o caso de quase
 * toda baixa; o aviso traz "Desfazer" para o toque errado.
 */
function QuickReceiveButton({ item, today }: { item: Receivable; today: string }) {
  const [pending, startTransition] = useTransition();
  const fields = (extra: Record<string, string>) => {
    const data = new FormData();
    for (const [key, value] of Object.entries({ receivableId: item.id, quoteId: item.quote_id, ...extra })) data.set(key, value);
    return data;
  };

  function receive() {
    startTransition(async () => {
      const result = await receiveInstallmentAction(
        undefined,
        fields({ receivedOn: today, receivedAmount: centsToMoneyInput(expectedCents(item)), method: item.method ?? "", restDueDate: "" }),
      );
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`Recebido ${formatCents(expectedCents(item))} de ${item.client_name ?? `Nº ${formatQuoteNumber(item.quote_number)}`}`, {
        action: {
          label: "Desfazer",
          onClick: () => {
            void undoReceiveInstallmentAction(undefined, fields({})).then((undo) => (undo.error ? toast.error(undo.error) : toast.success("Recebimento desfeito")));
          },
        },
      });
    });
  }

  return (
    <Button size="sm" onClick={receive} disabled={pending}>
      <Check className="size-4" /> {pending ? "Salvando..." : "Dar baixa"}
    </Button>
  );
}

/** Recibo da parcela recebida: no celular abre o compartilhar com o PDF; no computador, baixa. */
function ReceiptButton({ item }: { item: Receivable }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await getReceiptAction(item.id);
          if (!result.receipt) {
            toast.error(result.error ?? "Não foi possível gerar o recibo.");
            return;
          }
          await shareReceiptPdf(result.receipt);
        })
      }
    >
      <FileText className="size-4" /> {pending ? "Gerando..." : "Recibo"}
    </Button>
  );
}

type AnticipationMode = "" | "percent" | "amount";

/**
 * Valor recebido e, se houve, a antecipação feita no banco do cliente (fora do app). O dono informa o
 * que o banco cobrou, em % da parcela ou em reais; o valor recebido passa a ser o que sobra e a taxa
 * vira custo do serviço. Sem preencher nada, é a baixa de sempre.
 */
function ReceiveAmountFields({ item }: { item: Receivable }) {
  const [mode, setMode] = useState<AnticipationMode>("");
  const [value, setValue] = useState("");
  const fee = item.fee_cents ?? 0;

  let cents = 0;
  if (mode === "percent") {
    const bps = parseTaxRate(value);
    cents = bps !== null && bps >= 1 && bps <= 5000 ? anticipationCents(item.amount_cents, bps) : 0;
  } else if (mode === "amount") {
    cents = parseMoneyToCents(value) ?? 0;
  }
  const anticipating = mode !== "" && cents > 0;
  const tooBig = anticipating && cents >= item.amount_cents - fee;
  const net = item.amount_cents - fee - cents;

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`receive-amount-${item.id}`}>Valor recebido (R$)</Label>
        {anticipating && !tooBig ? (
          <>
            <Input id={`receive-amount-${item.id}`} readOnly value={formatCents(net)} aria-describedby={`receive-antic-${item.id}`} />
            <input type="hidden" name="receivedAmount" value={centsToMoneyInput(net)} />
          </>
        ) : (
          <MaskedInput mask="money" id={`receive-amount-${item.id}`} name="receivedAmount" defaultValue={centsToMoneyInput(expectedCents(item))} />
        )}
      </div>
      <fieldset className="flex flex-col gap-2 rounded-lg border p-3 sm:col-span-2">
        <legend className="px-1 text-sm font-medium">Antecipou no banco? (opcional)</legend>
        <p className="text-xs text-muted-foreground">
          Se o banco do cliente cobrou para antecipar esta parcela, informe quanto. Entra como custo do serviço e sai da margem; o faturado não muda.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`receive-antic-mode-${item.id}`}>O banco cobrou</Label>
            <select
              id={`receive-antic-mode-${item.id}`}
              name="anticipationMode"
              value={mode}
              onChange={(event) => {
                setMode(event.target.value as AnticipationMode);
                setValue("");
              }}
              className={SELECT_CLASS}
            >
              <option value="">Não antecipei</option>
              <option value="percent">Uma taxa em %</option>
              <option value="amount">Um valor em R$</option>
            </select>
          </div>
          {mode === "percent" ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`receive-antic-value-${item.id}`}>Taxa (% da parcela)</Label>
              <Input id={`receive-antic-value-${item.id}`} name="anticipationValue" inputMode="decimal" placeholder="Ex.: 3,5" autoComplete="off" value={value} onChange={(event) => setValue(event.target.value)} />
            </div>
          ) : null}
          {mode === "amount" ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`receive-antic-value-${item.id}`}>Valor cobrado (R$)</Label>
              <MaskedInput mask="money" id={`receive-antic-value-${item.id}`} name="anticipationValue" value={value} onChange={(event) => setValue(event.target.value)} />
            </div>
          ) : null}
        </div>
        {anticipating ? (
          <p id={`receive-antic-${item.id}`} role="status" className={`text-sm ${tooBig ? "text-destructive" : "text-muted-foreground"}`}>
            {tooBig
              ? `A antecipação precisa ser menor que ${formatCents(item.amount_cents - fee)}.`
              : `Taxa de antecipação ${formatCents(cents)} · entra ${formatCents(net)} no caixa.`}
          </p>
        ) : null}
      </fieldset>
    </>
  );
}

/** Recebeu outro valor, em outra data ou de outra forma: o formulário completo, com baixa parcial e antecipação. */
function ReceiveDifferentButton({ item, today }: { item: Receivable; today: string }) {
  return (
    <DialogForm
      title="Recebeu diferente?"
      description={`Parcela de ${formatCents(item.amount_cents)} do orçamento Nº ${formatQuoteNumber(item.quote_number)}${item.fee_cents ? `; entra ${formatCents(expectedCents(item))} depois da taxa do cartão` : ""}.`}
      action={receiveInstallmentAction}
      submitLabel="Registrar"
      trigger={(open) => (
        <Button
          size="sm"
          variant="outline"
          className={ICON_ACTION}
          title="Recebeu diferente? Outro valor, outra data ou antecipação do banco"
          aria-label={`Recebeu outro valor ou em outra data: parcela de ${formatCents(item.amount_cents)}`}
          onClick={open}
        >
          <HandCoins className="size-4" />
          <ActionLabel>Outro valor</ActionLabel>
        </Button>
      )}
    >
      <input type="hidden" name="receivableId" value={item.id} />
      <input type="hidden" name="quoteId" value={item.quote_id} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`receive-date-${item.id}`}>Recebido em</Label>
          <Input id={`receive-date-${item.id}`} name="receivedOn" type="date" max={today} defaultValue={today} />
        </div>
        <ReceiveAmountFields item={item} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`receive-method-${item.id}`}>Forma</Label>
        <MethodSelect id={`receive-method-${item.id}`} value={item.method} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`receive-rest-${item.id}`}>Se recebeu menos, o restante vence em</Label>
        <Input id={`receive-rest-${item.id}`} name="restDueDate" type="date" defaultValue={addDays(today, 30)} />
        <p className="text-xs text-muted-foreground">Com valor menor, o que faltar vira uma parcela nova a receber nessa data.</p>
      </div>
    </DialogForm>
  );
}

function RescheduleButton({ item }: { item: Receivable }) {
  return (
    <DialogForm
      title="Alterar parcela"
      description="Mude o vencimento ou a forma combinada. O valor continua o mesmo."
      action={rescheduleInstallmentAction}
      submitLabel="Salvar"
      trigger={(open) => (
        <Button
          size="sm"
          variant="outline"
          className={ICON_ACTION}
          title="Alterar o vencimento ou a forma de pagamento"
          aria-label={`Alterar a parcela de ${formatCents(item.amount_cents)}`}
          onClick={open}
        >
          <CalendarClock className="size-4" />
          <ActionLabel>Vencimento</ActionLabel>
        </Button>
      )}
    >
      <input type="hidden" name="receivableId" value={item.id} />
      <input type="hidden" name="quoteId" value={item.quote_id} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`reschedule-date-${item.id}`}>Vencimento</Label>
        <Input id={`reschedule-date-${item.id}`} name="dueDate" type="date" defaultValue={item.due_date} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`reschedule-method-${item.id}`}>Forma</Label>
        <MethodSelect id={`reschedule-method-${item.id}`} value={item.method} />
      </div>
    </DialogForm>
  );
}

/** Parcelas a receber ou recebidas, com baixa, reagendamento e desfazer. Só owner e admin chegam aqui. */
export function ReceivableList({
  items,
  today,
  showQuote = true,
  empty,
  companyName,
  reminderPhone,
}: {
  items: Receivable[];
  today: string;
  /** Na página do orçamento, o orçamento já está na tela. */
  showQuote?: boolean;
  empty: string;
  /** Com o nome da empresa, as parcelas a receber ganham o lembrete pelo WhatsApp. */
  companyName?: string;
  /** Na demonstração, o lembrete vai para o número comercial, nunca para um cliente de verdade. */
  reminderPhone?: string;
}) {
  if (items.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="flex flex-col divide-y text-sm">
      {items.map((item) => {
        const status = statusText(item, today);
        const details = [
          showQuote ? item.client_name : null,
          item.method ? PAYMENT_METHOD_LABEL[item.method] : null,
          item.fee_cents && !item.received_on ? `taxa ${formatCents(item.fee_cents)}, entra ${formatCents(expectedCents(item))}` : null,
          item.anticipation_cents ? `antecipação do banco ${formatCents(item.anticipation_cents)}` : null,
          // A situação já diz o vencimento; na atrasada, a data ajuda a cobrar.
          receivableStatus(item, today) === "overdue" ? `venceu em ${formatDate(item.due_date)}` : null,
        ].filter(Boolean);
        return (
          // No celular, o texto em cima e o valor com os botões embaixo: lado a lado, o texto ficava espremido.
          <li key={item.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            <span className="flex min-w-0 flex-col gap-0.5 sm:flex-1">
              {showQuote ? (
                <Link href={`/dashboard/quotes/${item.quote_id}`} className="font-medium break-words hover:underline">
                  #{formatQuoteNumber(item.quote_number)} · {item.quote_title ?? "Sem título"}
                </Link>
              ) : null}
              <span className={`text-xs font-medium ${status.tone}`}>{status.text}</span>
              {details.length > 0 ? <span className="text-xs text-muted-foreground">{details.join(" · ")}</span> : null}
            </span>
            <span className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:flex-nowrap">
              <span className="basis-full font-semibold tabular-nums sm:basis-auto">{formatCents(item.received_cents ?? item.amount_cents)}</span>
              {companyName && !item.received_on && (reminderPhone ?? item.contact_phone) ? (
                <Button
                  size="sm"
                  variant="outline"
                  className={ICON_ACTION}
                  title="Lembrar o cliente da cobrança pelo WhatsApp"
                  aria-label={`Lembrar ${item.contact_name ?? item.client_name ?? "o cliente"} pelo WhatsApp`}
                  render={<a href={whatsappUrl(reminderPhone ?? item.contact_phone ?? null, reminderText(item, companyName, today))} target="_blank" rel="noopener noreferrer" />}
                  nativeButton={false}
                >
                  <MessageCircle className="size-4" />
                  <ActionLabel>Lembrar</ActionLabel>
                </Button>
              ) : null}
              {item.received_on ? <ReceiptButton item={item} /> : null}
              {item.received_on ? (
                <ActionButton
                  action={undoReceiveInstallmentAction}
                  fields={{ receivableId: item.id, quoteId: item.quote_id }}
                  size="sm"
                  className={ICON_ACTION}
                  title="Desfazer o recebimento: a parcela volta para a receber"
                  ariaLabel={`Desfazer o recebimento de ${formatCents(item.received_cents ?? item.amount_cents)}`}
                >
                  <Undo2 className="size-4" />
                  <ActionLabel>Desfazer</ActionLabel>
                </ActionButton>
              ) : (
                <>
                  <RescheduleButton item={item} />
                  <ReceiveDifferentButton item={item} today={today} />
                  <QuickReceiveButton item={item} today={today} />
                </>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
