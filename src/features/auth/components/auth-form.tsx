"use client";

import { startTransition, useActionState, useEffect, useRef } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { ActionState } from "@/server/actions/action-state";

type AuthAction = (
  prev: ActionState | undefined,
  formData: FormData,
) => Promise<ActionState>;

interface AuthFormProps {
  action: AuthAction;
  submitLabel: string;
  children: React.ReactNode;
}

/**
 * Casca comum dos forms de auth: useActionState + exibição padronizada de
 * erro/sucesso + botão com estado pending. Os campos vêm como children.
 *
 * O envio passa pelo onSubmit para o React não limpar o formulário: com erro, o e-mail e os demais
 * campos continuam preenchidos e só a senha é apagada. Sem JavaScript, o form segue funcionando.
 */
export function AuthForm({ action, submitLabel, children }: AuthFormProps) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!state?.error || !formRef.current) return;
    const passwords = [...formRef.current.querySelectorAll<HTMLInputElement>('input[type="password"]')];
    for (const input of passwords) input.value = "";
    passwords[0]?.focus();
  }, [state]);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(() => formAction(data));
  }

  return (
    <form ref={formRef} action={formAction} onSubmit={onSubmit} className="flex flex-col gap-4">
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
      {children}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Aguarde..." : submitLabel}
      </Button>
    </form>
  );
}
