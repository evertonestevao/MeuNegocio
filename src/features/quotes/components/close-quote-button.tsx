"use client";

import { DialogForm } from "@/components/dialog-form";
import { MaskedInput } from "@/components/masked-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { centsToMoneyInput } from "@/lib/money";
import { closeQuoteAction } from "@/server/actions/quotes";

/** Fecha o orçamento aprovado: o serviço termina e o valor entra no faturamento. */
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
      description="O valor entra no faturamento na data de competência."
      action={closeQuoteAction}
      submitLabel={label}
      trigger={(open) => (
        <Button onClick={open} className={className}>
          {label}
        </Button>
      )}
    >
      <input type="hidden" name="quoteId" value={quoteId} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`close-amount-${quoteId}`}>Valor (R$)</Label>
        <MaskedInput mask="money" id={`close-amount-${quoteId}`} name="amount" defaultValue={centsToMoneyInput(totalCents)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`close-date-${quoteId}`}>Data de competência</Label>
        <Input id={`close-date-${quoteId}`} name="competenceDate" type="date" defaultValue={today} />
      </div>
    </DialogForm>
  );
}
