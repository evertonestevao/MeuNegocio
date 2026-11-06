"use client";

import Link from "next/link";
import { useTransition } from "react";
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
import { expectedCents, receivableStatus } from "@/lib/installments";
import { whatsappUrl } from "@/features/quotes/pdf";
import { reminderText } from "../reminder";
import { centsToMoneyInput, formatCents } from "@/lib/money";
import { getReceiptAction, receiveInstallmentAction, rescheduleInstallmentAction, undoReceiveInstallmentAction } from "@/server/actions/receivables";
import { shareReceiptPdf } from "../receipt-pdf";
import type { PaymentMethod, Receivable } from "@/types/finance";

const SELECT_CLASS =
  "border-input h-11 w-full rounded-lg border bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:h-9 dark:bg-input/30";

const METHODS = Object.entries(PAYMENT_METHOD_LABEL) as [PaymentMethod, string][];

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
      <Check className="size-4" /> {pending ? "Salvando..." : "Recebido"}
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

/** Recebeu outro valor, em outra data ou de outra forma: o formulário completo, com baixa parcial. */
function ReceiveDifferentButton({ item, today }: { item: Receivable; today: string }) {
  return (
    <DialogForm
      title="Recebeu diferente?"
      description={`Parcela de ${formatCents(item.amount_cents)} do orçamento Nº ${formatQuoteNumber(item.quote_number)}${item.fee_cents ? `; entra ${formatCents(expectedCents(item))} depois da taxa do cartão` : ""}.`}
      action={receiveInstallmentAction}
      submitLabel="Registrar"
      trigger={(open) => (
        <Button size="icon-sm" variant="outline" aria-label={`Recebeu outro valor ou em outra data: parcela de ${formatCents(item.amount_cents)}`} onClick={open}>
          <HandCoins className="size-4" />
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
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`receive-amount-${item.id}`}>Valor recebido (R$)</Label>
          <MaskedInput mask="money" id={`receive-amount-${item.id}`} name="receivedAmount" defaultValue={centsToMoneyInput(expectedCents(item))} />
        </div>
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
        <Button size="icon-sm" variant="outline" aria-label={`Alterar a parcela de ${formatCents(item.amount_cents)}`} onClick={open}>
          <CalendarClock className="size-4" />
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
            <span className="flex shrink-0 items-center gap-2">
              <span className="mr-auto font-semibold tabular-nums sm:mr-0">{formatCents(item.received_cents ?? item.amount_cents)}</span>
              {companyName && !item.received_on && (reminderPhone ?? item.contact_phone) ? (
                <Button
                  size="icon-sm"
                  variant="outline"
                  aria-label={`Lembrar ${item.contact_name ?? item.client_name ?? "o cliente"} pelo WhatsApp`}
                  render={<a href={whatsappUrl(reminderPhone ?? item.contact_phone ?? null, reminderText(item, companyName, today))} target="_blank" rel="noopener noreferrer" />}
                  nativeButton={false}
                >
                  <MessageCircle className="size-4" />
                </Button>
              ) : null}
              {item.received_on ? <ReceiptButton item={item} /> : null}
              {item.received_on ? (
                <ActionButton
                  action={undoReceiveInstallmentAction}
                  fields={{ receivableId: item.id, quoteId: item.quote_id }}
                  size="icon-sm"
                  ariaLabel={`Desfazer o recebimento de ${formatCents(item.received_cents ?? item.amount_cents)}`}
                >
                  <Undo2 className="size-4" />
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
