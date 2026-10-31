"use client";

import { startTransition, useActionState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { ActionState } from "@/server/actions/action-state";

/** Botão que dispara uma server action sem confirmação. Resultado em toast. */
export function ActionButton({
  action,
  fields,
  children,
  variant = "outline",
  size = "sm",
  ariaLabel,
}: {
  action: (prev: ActionState | undefined, formData: FormData) => Promise<ActionState>;
  fields: Record<string, string>;
  children: React.ReactNode;
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "icon-sm";
  ariaLabel?: string;
}) {
  const [, dispatch, pending] = useActionState(async (prev: ActionState | undefined, data: FormData) => {
    const result = await action(prev, data);
    if (result.error) toast.error(result.error);
    if (result.success) toast.success(result.success);
    return result;
  }, undefined);

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      disabled={pending}
      aria-label={ariaLabel}
      onClick={() => {
        const data = new FormData();
        for (const [key, value] of Object.entries(fields)) data.set(key, value);
        startTransition(() => dispatch(data));
      }}
    >
      {children}
    </Button>
  );
}
