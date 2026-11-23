"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { CalendarCheck, Check, Undo2 } from "lucide-react";
import { ActionButton } from "@/components/action-button";
import { DialogForm } from "@/components/dialog-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EXPENSE_KIND_LABEL, PAYMENT_METHOD_LABEL } from "@/features/expenses/schemas";
import { formatDate } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { payableStatus } from "@/lib/payables";
import { payExpenseInstallmentAction, undoPayExpenseInstallmentAction } from "@/server/actions/expenses";
import type { PayableItem } from "@/types/finance";

/**
 * Botões de ação da parcela. No celular não existe "passar o mouse", então o texto fica ao lado do
 * ícone; a partir de 640px (sm) viram só o ícone, com a legenda no `title`.
 */
const ICON_ACTION = "sm:w-9 sm:px-0 md:w-7";
function ActionLabel({ children }: { children: React.ReactNode }) {
  return <span className="sm:hidden">{children}</span>;
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
}

function statusText(item: PayableItem, today: string): { text: string; tone: string } {
  const status = payableStatus(item, today);
  if (status === "paid") return { text: `Paga em ${formatDate(item.paid_on)}`, tone: "text-success" };
  if (status === "overdue") {
    const days = daysBetween(item.due_date, today);
    return { text: `Atrasada há ${days} ${days === 1 ? "dia" : "dias"}`, tone: "text-destructive" };
  }
  if (status === "due_today") return { text: "Vence hoje", tone: "text-warning" };
  return { text: `Vence em ${formatDate(item.due_date)}`, tone: "text-muted-foreground" };
}

/** Pago com um toque: hoje, no valor da parcela. O aviso traz "Desfazer" para o toque errado. */
function QuickPayButton({ item, today }: { item: PayableItem; today: string }) {
  const [pending, startTransition] = useTransition();
  const fields = (extra: Record<string, string>) => {
    const data = new FormData();
    for (const [key, value] of Object.entries({ installmentId: item.id, ...extra })) data.set(key, value);
    return data;
  };

  function pay() {
    startTransition(async () => {
      const result = await payExpenseInstallmentAction(undefined, fields({ paidOn: today }));
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`Pago ${formatCents(item.amount_cents)} de ${item.description}`, {
        action: {
          label: "Desfazer",
          onClick: () => {
            void undoPayExpenseInstallmentAction(undefined, fields({})).then((undo) => (undo.error ? toast.error(undo.error) : toast.success("Pagamento desfeito")));
          },
        },
      });
    });
  }

  return (
    <Button size="sm" onClick={pay} disabled={pending}>
      <Check className="size-4" /> {pending ? "Salvando..." : "Dar baixa"}
    </Button>
  );
}

/** Pagou em outro dia: só a data muda; o valor é o da parcela. */
function PayOnDateButton({ item, today }: { item: PayableItem; today: string }) {
  return (
    <DialogForm
      title="Pagou em outro dia?"
      description={`${item.description}: parcela de ${formatCents(item.amount_cents)}, com vencimento em ${formatDate(item.due_date)}.`}
      action={payExpenseInstallmentAction}
      submitLabel="Registrar pagamento"
      trigger={(open) => (
        <Button
          size="sm"
          variant="outline"
          className={ICON_ACTION}
          title="Pagou em outro dia? Informe a data do pagamento"
          aria-label={`Registrar o pagamento de ${item.description} em outra data`}
          onClick={open}
        >
          <CalendarCheck className="size-4" />
          <ActionLabel>Outra data</ActionLabel>
        </Button>
      )}
    >
      <input type="hidden" name="installmentId" value={item.id} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`pay-date-${item.id}`}>Pago em</Label>
        <Input id={`pay-date-${item.id}`} name="paidOn" type="date" max={today} defaultValue={item.due_date < today ? item.due_date : today} />
        <p className="text-xs text-muted-foreground">Até hoje. O pagamento entra no caixa do mês dessa data.</p>
      </div>
    </DialogForm>
  );
}

/** Parcelas a pagar ou pagas, com baixa e desfazer. Só owner e admin chegam aqui. */
export function PayableList({ items, today, empty }: { items: PayableItem[]; today: string; empty: string }) {
  if (items.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="flex flex-col divide-y text-sm">
      {items.map((item) => {
        const status = statusText(item, today);
        const details = [
          item.installments_count > 1 ? `Parcela ${item.number} de ${item.installments_count}` : null,
          item.supplier,
          item.category_name,
          item.payment_method ? PAYMENT_METHOD_LABEL[item.payment_method] : null,
          item.kind === "one_off" ? null : EXPENSE_KIND_LABEL[item.kind],
          payableStatus(item, today) === "overdue" ? `venceu em ${formatDate(item.due_date)}` : null,
        ].filter(Boolean);
        return (
          // No celular, o texto em cima e o valor com os botões embaixo: lado a lado, o texto ficava espremido.
          <li key={item.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            <span className="flex min-w-0 flex-col gap-0.5 sm:flex-1">
              <span className="font-medium break-words">{item.description}</span>
              <span className={`text-xs font-medium ${status.tone}`}>{status.text}</span>
              {details.length > 0 ? <span className="text-xs text-muted-foreground">{details.join(" · ")}</span> : null}
            </span>
            <span className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:flex-nowrap">
              <span className="basis-full font-semibold tabular-nums sm:basis-auto">{formatCents(item.amount_cents)}</span>
              {item.paid_on ? (
                <ActionButton
                  action={undoPayExpenseInstallmentAction}
                  fields={{ installmentId: item.id }}
                  size="sm"
                  className={ICON_ACTION}
                  title="Desfazer o pagamento: a parcela volta para a pagar"
                  ariaLabel={`Desfazer o pagamento de ${item.description}`}
                >
                  <Undo2 className="size-4" />
                  <ActionLabel>Desfazer</ActionLabel>
                </ActionButton>
              ) : (
                <>
                  <PayOnDateButton item={item} today={today} />
                  <QuickPayButton item={item} today={today} />
                </>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
