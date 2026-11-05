"use client";

import { startTransition, useActionState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { taxRateInput } from "@/lib/tax";
import { saveCardFeesAction } from "@/server/actions/tax";
import { cardFeesSchema } from "@/services/taxService";
import type { CardFees } from "@/types/finance";

/** Taxas da maquininha: viram custo do serviço nas parcelas no crédito e no débito. */
export function CardFeesForm({ fees }: { fees: CardFees }) {
  const [state, dispatch, pending] = useActionState(
    async (_prev: { error?: string } | undefined, data: FormData) => {
      const parsed = cardFeesSchema.safeParse(Object.fromEntries(data));
      if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
      const result = await saveCardFeesAction(undefined, data);
      if (result.success) toast.success(result.success);
      return result;
    },
    undefined,
  );

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        startTransition(() => dispatch(data));
      }}
      className="flex flex-col gap-4"
    >
      {state?.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="card-fee-credit">Crédito (%)</Label>
          <Input id="card-fee-credit" name="creditFee" inputMode="decimal" placeholder="Ex.: 3,49" defaultValue={fees.creditBps ? taxRateInput(fees.creditBps) : ""} className="max-w-32" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="card-fee-debit">Débito (%)</Label>
          <Input id="card-fee-debit" name="debitFee" inputMode="decimal" placeholder="Ex.: 1,99" defaultValue={fees.debitBps ? taxRateInput(fees.debitBps) : ""} className="max-w-32" />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Use a taxa da sua maquininha. Ela sai do valor de cada parcela no cartão: entra no caixa o valor sem a taxa, e a taxa vira custo do serviço.
        Mudar aqui vale para os próximos fechamentos.
      </p>
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Salvando..." : "Salvar taxas"}
      </Button>
    </form>
  );
}
