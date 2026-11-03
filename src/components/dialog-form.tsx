"use client";

import { startTransition, useActionState, useRef, useState } from "react";
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
const SHEET_CLASS =
  "flex max-h-[92dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg max-sm:top-auto max-sm:bottom-0 max-sm:left-0 max-sm:max-w-full max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-b-none max-sm:rounded-t-3xl";

export function DialogForm({
  title,
  description,
  trigger,
  action,
  validate,
  submitLabel,
  variant,
  defaultOpen = false,
  children,
}: {
  title: string;
  description?: string;
  trigger: (open: () => void) => React.ReactNode;
  action: (prev: ActionState | undefined, formData: FormData) => Promise<ActionState>;
  validate?: (formData: FormData) => unknown;
  submitLabel: string;
  variant?: "default" | "destructive";
  defaultOpen?: boolean;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const headerRef = useRef<HTMLDivElement>(null);
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
        {/* No celular, folha que sobe de baixo: título fixo, campos rolando e botões sempre à vista. */}
        <DialogContent
          className={SHEET_CLASS}
          // Em tela de toque, não foca o primeiro campo: o teclado subiria e cobriria metade do formulário.
          // O botão que abre a folha não é o gatilho do Dialog, então o tipo de interação não chega aqui.
          initialFocus={() => (window.matchMedia("(pointer: coarse)").matches ? headerRef.current : true)}
        >
          <span className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-muted-foreground/25 sm:hidden" aria-hidden />
          <DialogHeader ref={headerRef} tabIndex={-1} className="shrink-0 px-4 pt-3 pr-12 pb-3 outline-none sm:px-6 sm:pt-6">
            <DialogTitle>{title}</DialogTitle>
            {description ? <DialogDescription>{description}</DialogDescription> : null}
          </DialogHeader>
          <form onSubmit={onSubmit} className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-4 pb-4 sm:px-6">
              {state?.error ? (
                <Alert variant="destructive">
                  <AlertDescription>{state.error}</AlertDescription>
                </Alert>
              ) : null}
              {children}
            </div>
            <DialogFooter className="mx-0 mb-0 shrink-0 rounded-b-none px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:rounded-b-xl sm:px-6 sm:pb-4">
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
