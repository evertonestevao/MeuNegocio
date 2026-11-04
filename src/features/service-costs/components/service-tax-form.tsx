"use client";

import Link from "next/link";
import { startTransition, useActionState, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCents } from "@/lib/money";
import { formatTaxRate, taxRateInput, taxRatePercentSchema } from "@/lib/tax";
import { setServiceTaxRateAction } from "@/server/actions/quotes";
import type { TaxSource } from "@/services/serviceCostService";

const SOURCE_LABEL: Record<TaxSource, string> = {
  service: "deste serviço",
  company: "padrão da empresa",
  none: "",
};

/** Imposto estimado do serviço, com a alíquota sugerida pela empresa e a opção de mudar só neste. */
export function ServiceTaxForm({ quoteId, rateBps, taxCents, source }: { quoteId: string; rateBps: number; taxCents: number; source: TaxSource }) {
  const [editing, setEditing] = useState(false);
  const [state, dispatch, pending] = useActionState(
    async (_prev: { error?: string } | undefined, data: FormData) => {
      const parsed = taxRatePercentSchema.safeParse(String(data.get("taxRate") ?? ""));
      if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Alíquota inválida." };
      const result = await setServiceTaxRateAction(undefined, data);
      if (result.success) {
        toast.success(result.success);
        setEditing(false);
      }
      return result;
    },
    undefined,
  );

  if (!editing) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-lg bg-muted px-3 py-2 text-sm">
        {source === "none" ? (
          <span>
            Imposto não descontado.{" "}
            <Link href="/dashboard/settings/impostos" className="font-medium text-primary hover:underline">
              Informe o regime da empresa
            </Link>{" "}
            ou a alíquota deste serviço.
          </span>
        ) : (
          <span>
            Imposto estimado: <strong className="tabular-nums">{formatCents(taxCents)}</strong>{" "}
            <span className="text-muted-foreground">
              ({formatTaxRate(rateBps)} do valor cobrado, {SOURCE_LABEL[source]})
            </span>
          </span>
        )}
        <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)}>
          Alterar alíquota
        </Button>
      </div>
    );
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        startTransition(() => dispatch(data));
      }}
      className="flex flex-col gap-2 rounded-lg bg-muted px-3 py-2 text-sm"
    >
      <input type="hidden" name="quoteId" value={quoteId} />
      <label htmlFor="service-tax-rate" className="font-medium">
        Alíquota do imposto deste serviço (%)
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <Input id="service-tax-rate" name="taxRate" inputMode="decimal" defaultValue={taxRateInput(rateBps)} className="max-w-28 bg-background" autoFocus />
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Salvando..." : "Salvar"}
        </Button>
        <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => setEditing(false)}>
          Cancelar
        </Button>
      </div>
      {state?.error ? <p className="text-destructive">{state.error}</p> : null}
      <p className="text-xs text-muted-foreground">
        Vale só para este serviço. É uma estimativa para medir a margem: o valor oficial é o da guia apurada pelo contador.
      </p>
    </form>
  );
}
