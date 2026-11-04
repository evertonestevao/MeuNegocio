"use client";

import { startTransition, useActionState, useMemo, useState } from "react";
import { toast } from "sonner";
import { MaskedInput } from "@/components/masked-input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { formatMonth } from "@/lib/calendar";
import { centsToMoneyInput, formatCents, parseMoneyToCents } from "@/lib/money";
import { rbt12Cents, simplesRate } from "@/lib/simplesNacional";
import { saveMonthlyRevenuesAction } from "@/server/actions/tax";
import type { CompanyTax } from "@/types/tax";
import { TaxRateSummary } from "./tax-rate-summary";

/**
 * Os 12 meses da base do RBT12: o lançado no sistema (orçamentos fechados) e, se quiser, o valor
 * informado, que vale no lugar dele. A alíquota do mês é recalculada na tela enquanto a pessoa digita.
 */
export function MonthlyRevenuesForm({ tax }: { tax: CompanyTax }) {
  const [informed, setInformed] = useState<Record<string, string>>(() =>
    Object.fromEntries(tax.months.map((month) => [month.month, month.informed_cents === null ? "" : centsToMoneyInput(month.informed_cents)])),
  );
  const [state, dispatch, pending] = useActionState(
    async (_prev: { error?: string } | undefined, data: FormData) => {
      const result = await saveMonthlyRevenuesAction(undefined, data);
      if (result.success) toast.success(result.success);
      return result;
    },
    undefined,
  );

  const detail = tax.detail;
  const preview = useMemo(() => {
    if (!detail) return null;
    // Só os meses de atividade entram, como no banco.
    const counted = tax.months.slice(0, detail.months);
    const amounts = counted.map((month) => parseMoneyToCents(informed[month.month] ?? "") ?? month.launched_cents);
    const rbt12 = rbt12Cents(amounts, detail.months);
    return { rbt12, ...simplesRate(detail.effective_annex, rbt12) };
  }, [detail, tax.months, informed]);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        startTransition(() => dispatch(data));
      }}
      className="flex flex-col gap-4"
    >
      {detail && preview ? <TaxRateSummary detail={detail} rbt12Cents={preview.rbt12} rateBps={preview.rateBps} bracket={preview} /> : null}
      {state?.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="flex flex-col">
        <div className="grid grid-cols-[1fr_auto_9.5rem] items-center gap-3 border-b pb-2 text-xs font-medium text-muted-foreground sm:grid-cols-[1fr_8rem_11rem]">
          <span>Mês</span>
          <span className="text-right">No sistema</span>
          <span>Informado</span>
        </div>
        {tax.months.map((month, index) => {
          const counted = !detail || index < detail.months;
          return (
            <div key={month.month} className={`grid grid-cols-[1fr_auto_9.5rem] items-center gap-3 border-b py-2 text-sm sm:grid-cols-[1fr_8rem_11rem] ${counted ? "" : "opacity-50"}`}>
              <label htmlFor={`revenue-${month.month}`}>{formatMonth(month.month)}</label>
              <span className="text-right tabular-nums text-muted-foreground">{formatCents(month.launched_cents)}</span>
              <MaskedInput
                mask="money"
                id={`revenue-${month.month}`}
                name={`revenue-${month.month}`}
                value={informed[month.month] ?? ""}
                onChange={(event) => setInformed((current) => ({ ...current, [month.month]: event.target.value }))}
                placeholder="—"
              />
            </div>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        Preencha os meses de antes de usar o sistema, ou quando o faturamento do mês foi diferente do lançado (notas emitidas por fora, por exemplo).
        O valor informado vale no lugar do lançado. Deixe em branco para usar o do sistema.
        {detail && detail.months < 12 ? " Meses antes do início das atividades não entram na conta." : ""}
      </p>
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Salvando..." : "Salvar faturamento"}
      </Button>
    </form>
  );
}
