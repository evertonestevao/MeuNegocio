"use client";

import { startTransition, useActionState, useRef } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { grantPlanAccessAction, revokePlanAccessAction } from "@/server/actions/plans";
import type { ActionState } from "@/server/actions/action-state";

/** Lista de e-mails que enxergam um plano privado: colar vários de uma vez e remover um a um. */
export function PlanAccessEditor({ planId, emails }: { planId: string; emails: string[] }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [grantState, grant, granting] = useActionState(async (prev: ActionState | undefined, data: FormData) => {
    const result = await grantPlanAccessAction(prev, data);
    if (result.success) {
      toast.success(result.success);
      formRef.current?.reset();
    }
    return result;
  }, undefined);
  const [, revoke, revoking] = useActionState(async (_prev: undefined, data: FormData) => {
    const result = await revokePlanAccessAction(undefined, data);
    if (result.error) toast.error(result.error);
    if (result.success) toast.success(result.success);
    return undefined;
  }, undefined);

  function removeEmail(email: string) {
    const data = new FormData();
    data.set("planId", planId);
    data.set("email", email);
    startTransition(() => revoke(data));
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-muted/30 p-3">
      <p className="text-sm font-medium">Quem pode ver este plano ({emails.length})</p>
      {emails.length === 0 ? (
        <p className="text-sm text-muted-foreground">Ninguém ainda. Enquanto a lista estiver vazia, o plano não aparece para ninguém.</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {emails.map((email) => (
            <li key={email} className="flex items-center gap-1 rounded-full border bg-background py-0.5 pl-3 pr-1 text-sm">
              {email}
              <button
                type="button"
                disabled={revoking}
                onClick={() => removeEmail(email)}
                aria-label={`Remover ${email}`}
                className="flex size-6 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-60"
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        ref={formRef}
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          startTransition(() => grant(data));
        }}
        className="flex flex-col gap-2"
      >
        <input type="hidden" name="planId" value={planId} />
        {grantState?.error ? (
          <Alert variant="destructive">
            <AlertDescription>{grantState.error}</AlertDescription>
          </Alert>
        ) : null}
        <Label htmlFor={`access-${planId}`}>Liberar e-mails</Label>
        <textarea
          id={`access-${planId}`}
          name="emails"
          required
          placeholder="amigo@exemplo.com, outro@exemplo.com"
          className="border-input min-h-16 rounded-lg border bg-background px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        <p className="text-xs text-muted-foreground">
          Um ou vários, separados por vírgula, espaço ou linha. A pessoa precisa se cadastrar com esse mesmo e-mail e confirmá-lo.
          Remover da lista não tira o plano de quem já assina.
        </p>
        <Button type="submit" size="sm" disabled={granting} className="self-start">
          {granting ? "Liberando..." : "Liberar"}
        </Button>
      </form>
    </div>
  );
}
