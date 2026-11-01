"use client";

import { startTransition, useActionState, useRef } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { provisionCompanyAction } from "@/server/actions/platformCompanies";
import type { Plan } from "@/types/database";

export function ProvisionCompanyForm({ plans, loginUrl }: { plans: Pick<Plan, "id" | "name">[]; loginUrl: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, dispatch, pending] = useActionState(async (prev: Parameters<typeof provisionCompanyAction>[0], data: FormData) => {
    const result = await provisionCompanyAction(prev, data);
    if (result.credentials) formRef.current?.reset();
    return result;
  }, undefined);

  return (
    <form
      ref={formRef}
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
      {state?.credentials ? (
        <div className="flex flex-col gap-2 rounded-lg border border-success/40 bg-success/10 p-4 text-sm">
          <p className="font-medium">{state.success}. Envie estes dados ao responsável:</p>
          <dl className="grid gap-1">
            <div className="flex flex-wrap gap-x-2"><dt className="text-muted-foreground">Endereço:</dt><dd className="break-all">{loginUrl}</dd></div>
            <div className="flex flex-wrap gap-x-2"><dt className="text-muted-foreground">E-mail:</dt><dd className="break-all">{state.credentials.email}</dd></div>
            <div className="flex flex-wrap gap-x-2"><dt className="text-muted-foreground">Senha temporária:</dt><dd data-testid="temporary-password" className="font-mono font-medium break-all">{state.credentials.temporaryPassword}</dd></div>
          </dl>
          <p className="text-muted-foreground">A senha aparece só agora. No primeiro acesso, a pessoa precisa criar uma senha nova.</p>
        </div>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="companyName">Nome da empresa</Label>
          <Input id="companyName" name="companyName" required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ownerName">Nome do responsável</Label>
          <Input id="ownerName" name="ownerName" required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ownerEmail">E-mail do responsável</Label>
          <Input id="ownerEmail" name="ownerEmail" type="email" autoComplete="off" required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="planId">Plano</Label>
          <select
            id="planId"
            name="planId"
            defaultValue=""
            className="border-input h-8 rounded-lg border bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
          >
            <option value="">Sem plano, com os limites do gratuito</option>
            {plans.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.name}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">Libera o plano sem cobrança, pelo período dele, sem renovar sozinho.</p>
        </div>
      </div>
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Criando..." : "Criar empresa e acesso"}
      </Button>
    </form>
  );
}
