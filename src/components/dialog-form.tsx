"use client";

import { startTransition, useActionState, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ActionState } from "@/server/actions/action-state";

/**
 * Formulário em diálogo: valida no navegador antes de chamar a server action (o servidor
 * valida de novo). Em erro os campos ficam como estão, e em sucesso o diálogo fecha.
 */
export function DialogForm({
  title,
  description,
  trigger,
  action,
  validate,
  submitLabel,
  variant,
  children,
}: {
  title: string;
  description?: string;
  trigger: (open: () => void) => React.ReactNode;
  action: (prev: ActionState | undefined, formData: FormData) => Promise<ActionState>;
  validate?: (formData: FormData) => unknown;
  submitLabel: string;
  variant?: "default" | "destructive";
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [state, dispatch, pending] = useActionState(
    async (prev: ActionState | undefined, data: FormData): Promise<ActionState | undefined> => {
      try {
        validate?.(data);
      } catch (err) {
        return { error: err instanceof z.ZodError ? (err.issues[0]?.message ?? "Dados inválidos.") : "Dados inválidos." };
      }
      const result = await action(prev, data);
      if (result?.success) {
        toast.success(result.success);
        setOpen(false);
      }
      return result;
    },
    undefined,
  );

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(() => dispatch(data));
  }

  return (
    <>
      {trigger(() => setOpen(true))}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description ? <DialogDescription>{description}</DialogDescription> : null}
          </DialogHeader>
          <form onSubmit={onSubmit} className="flex min-w-0 flex-col gap-4">
            {state?.error ? (
              <Alert variant="destructive">
                <AlertDescription>{state.error}</AlertDescription>
              </Alert>
            ) : null}
            {children}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" variant={variant} disabled={pending}>
                {pending ? "Salvando..." : submitLabel}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
