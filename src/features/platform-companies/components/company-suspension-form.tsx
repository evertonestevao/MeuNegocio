"use client";

import { startTransition, useActionState } from "react";
import { Printer } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { setCompanySuspensionAction } from "@/server/actions/platformCompanies";

/** Suspender ou reativar, com motivo obrigatório. O motivo vai para o histórico da empresa. */
export function CompanySuspensionForm({ companyId, suspended }: { companyId: string; suspended: boolean }) {
  const [state, dispatch, pending] = useActionState(setCompanySuspensionAction, undefined);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        startTransition(() => dispatch(data));
      }}
      className="flex flex-col gap-3 print:hidden"
    >
      {state?.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      {state?.success ? (
        <Alert>
          <AlertDescription>{state.success}</AlertDescription>
        </Alert>
      ) : null}
      <input type="hidden" name="companyId" value={companyId} />
      <input type="hidden" name="suspend" value={suspended ? "0" : "1"} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="suspension-reason">{suspended ? "Motivo da reativação" : "Motivo da suspensão"}</Label>
        <textarea
          id="suspension-reason"
          name="reason"
          required
          minLength={5}
          maxLength={1000}
          rows={3}
          className="border-input w-full rounded-lg border bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
        />
        <p className="text-xs text-muted-foreground">
          {suspended ? "A empresa volta a entrar no painel e os links de orçamento voltam a abrir." : "A empresa deixa de entrar no painel e os links de orçamento dela deixam de abrir. Os dados ficam guardados."}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant={suspended ? "default" : "destructive"} disabled={pending}>
          {pending ? "Salvando..." : suspended ? "Reativar empresa" : "Suspender empresa"}
        </Button>
        <Button type="button" variant="outline" onClick={() => window.print()}>
          <Printer className="size-4" /> Imprimir ou salvar em PDF
        </Button>
      </div>
    </form>
  );
}
