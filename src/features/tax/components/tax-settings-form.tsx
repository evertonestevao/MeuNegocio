"use client";

import { startTransition, useActionState, useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatTaxRate, TAX_REGIME_LABEL, TAX_REGIMES, taxRateInput } from "@/lib/tax";
import { saveTaxSettingsAction } from "@/server/actions/tax";
import { SIMPLES_ANNEXES, taxSettingsSchema } from "@/services/taxService";
import type { SimplesAnnex, CompanyTax } from "@/types/tax";

const SELECT_CLASS =
  "border-input h-11 w-full rounded-lg border bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:h-9 dark:bg-input/30";

const ANNEX_LABEL: Record<SimplesAnnex, string> = {
  III: "Anexo III: instalação, manutenção, reparos e a maior parte dos serviços",
  IV: "Anexo IV: construção civil, limpeza e vigilância",
  V: "Anexo V: serviços técnicos e intelectuais",
};

/** Regime e forma de calcular a alíquota. O cálculo pelo faturamento é opcional. */
export function TaxSettingsForm({ tax }: { tax: CompanyTax }) {
  const [regime, setRegime] = useState<string>(tax.regime ?? "");
  const [mode, setMode] = useState<"manual" | "auto">(tax.auto ? "auto" : "manual");
  const [annex, setAnnex] = useState<string>(tax.annex ?? "");
  const [state, dispatch, pending] = useActionState(
    async (_prev: { error?: string } | undefined, data: FormData) => {
      const parsed = taxSettingsSchema.safeParse(Object.fromEntries(data));
      if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
      const result = await saveTaxSettingsAction(undefined, data);
      if (result.success) toast.success(result.success);
      return result;
    },
    undefined,
  );
  const simples = regime === "simples";
  const suggestion = tax.detail && !tax.auto ? tax.detail.rate_bps : null;

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

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="tax-regime">Regime tributário</Label>
        <select id="tax-regime" name="taxRegime" value={regime} onChange={(event) => setRegime(event.target.value)} className={SELECT_CLASS}>
          <option value="">Não informado (o resultado não desconta imposto)</option>
          {TAX_REGIMES.map((option) => (
            <option key={option} value={option}>
              {TAX_REGIME_LABEL[option]}
            </option>
          ))}
        </select>
        {regime === "mei" ? (
          <p className="text-xs text-muted-foreground">No MEI o imposto é um valor fixo por mês: lance o DAS como gasto recorrente. Não há percentual por serviço.</p>
        ) : null}
      </div>

      {simples ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-sm font-medium">Como definir a alíquota</legend>
          <label className="flex items-start gap-2 rounded-lg border p-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5">
            <input type="radio" name="taxMode" value="auto" checked={mode === "auto"} onChange={() => setMode("auto")} className="mt-1" />
            <span className="flex flex-col">
              <span className="font-medium">Calcular pelo faturamento (RBT12)</span>
              <span className="text-xs text-muted-foreground">Todo mês, pela soma dos 12 meses anteriores e pela faixa do anexo.</span>
            </span>
          </label>
          <label className="flex items-start gap-2 rounded-lg border p-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5">
            <input type="radio" name="taxMode" value="manual" checked={mode === "manual"} onChange={() => setMode("manual")} className="mt-1" />
            <span className="flex flex-col">
              <span className="font-medium">Informar a alíquota</span>
              <span className="text-xs text-muted-foreground">Use a alíquota efetiva que o contador passa e atualize quando ela mudar.</span>
            </span>
          </label>
        </fieldset>
      ) : (
        <input type="hidden" name="taxMode" value="manual" />
      )}

      {simples ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="tax-annex">Anexo do Simples Nacional{mode === "auto" ? "" : " (opcional)"}</Label>
          <select id="tax-annex" name="simplesAnnex" value={annex} onChange={(event) => setAnnex(event.target.value)} className={SELECT_CLASS}>
            <option value="">Escolha o anexo</option>
            {SIMPLES_ANNEXES.map((option) => (
              <option key={option} value={option}>
                {ANNEX_LABEL[option]}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">Confirme o anexo da sua atividade com o contador.</p>
        </div>
      ) : null}

      {simples && annex === "V" ? (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="fatorR" defaultChecked={tax.fator_r} className="mt-1" />
          <span className="flex flex-col">
            <span>A folha de pagamento é 28% ou mais do faturamento (Fator R)</span>
            <span className="text-xs text-muted-foreground">Com o Fator R, o Anexo V é tributado pelo Anexo III, que é mais barato.</span>
          </span>
        </label>
      ) : null}

      {simples ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="tax-activity">Início das atividades (opcional)</Label>
          <Input id="tax-activity" name="activityStartedOn" type="date" defaultValue={tax.activity_started_on ?? ""} className="max-w-48" />
          <p className="text-xs text-muted-foreground">Só faz diferença no primeiro ano: com menos de 12 meses, o RBT12 é a média dos meses de atividade × 12.</p>
        </div>
      ) : null}

      {(simples && mode === "manual") || regime === "other" ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="tax-rate">Imposto sobre o valor cobrado (%)</Label>
          <Input
            id="tax-rate"
            name="taxRate"
            inputMode="decimal"
            placeholder="Ex.: 6 ou 8,43"
            defaultValue={tax.manual_rate_bps ? taxRateInput(tax.manual_rate_bps) : ""}
            className="max-w-32"
          />
          {suggestion !== null ? (
            <p className="text-xs text-muted-foreground">Pelo faturamento dos últimos 12 meses, a alíquota deste mês seria {formatTaxRate(suggestion)}.</p>
          ) : null}
        </div>
      ) : null}

      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Salvando..." : "Salvar"}
      </Button>
    </form>
  );
}
