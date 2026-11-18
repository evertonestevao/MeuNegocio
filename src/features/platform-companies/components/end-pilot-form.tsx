"use client";

import { startTransition, useActionState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { endPilotAction } from "@/server/actions/platformCompanies";

/** Encerrar o plano piloto de uma empresa. Pede confirmação: a empresa perde o acesso até assinar um plano. */
export function EndPilotForm({ companyId, planName }: { companyId: string; planName: string }) {
  const [state, dispatch, pending] = useActionState(endPilotAction, undefined);
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
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="confirm" className="mt-1 size-4" />
        <span>
          Encerrar o plano {planName} desta empresa. No próximo acesso, o proprietário cai na tela de assinar e escolhe um plano. O e-mail
          dele sai da lista do plano, e nenhum dado da empresa é apagado.
        </span>
      </label>
      <div>
        <Button type="submit" variant="destructive" disabled={pending}>
          {pending ? "Encerrando..." : "Encerrar piloto"}
        </Button>
      </div>
    </form>
  );
}
