"use client";

import { startTransition, useActionState, useRef } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PLAN_FEATURES } from "@/config/planFeatures";
import { firstValidationMessage, parsePlanForm, planCodeSchema } from "@/features/plans/schemas";
import { centsToMoneyInput } from "@/lib/money";
import type { ActionState } from "@/server/actions/action-state";
import type { Plan } from "@/types/database";

type FormAction = (prev: ActionState | undefined, formData: FormData) => Promise<ActionState>;

/** Sem `plan` cria um plano novo. Valida aqui antes de enviar; o servidor valida de novo. */
export function PlanForm({ plan, action, submitLabel }: { plan?: Plan; action: FormAction; submitLabel: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const idPrefix = plan?.id ?? "novo";
  const [state, dispatch, pending] = useActionState(
    async (prev: ActionState | undefined, data: FormData) => {
      try {
        parsePlanForm(data);
        if (!plan) planCodeSchema.parse(data.get("code"));
      } catch (err) {
        return { error: firstValidationMessage(err) ?? "Dados inválidos." };
      }
      const result = await action(prev, data);
      if (result.success) {
        toast.success(result.success);
        if (!plan) formRef.current?.reset();
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
    <form ref={formRef} onSubmit={onSubmit} className="flex flex-col gap-4">
      {state?.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      {plan ? <input type="hidden" name="planId" value={plan.id} /> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        {plan ? null : (
          <Field id={`${idPrefix}-code`} label="Código" hint="Não muda depois de criado. Ex.: plus">
            <Input id={`${idPrefix}-code`} name="code" required autoComplete="off" />
          </Field>
        )}
        <Field id={`${idPrefix}-name`} label="Nome">
          <Input id={`${idPrefix}-name`} name="name" defaultValue={plan?.name ?? ""} required />
        </Field>
        <Field id={`${idPrefix}-price`} label="Preço por mês (R$)">
          <Input
            id={`${idPrefix}-price`}
            name="price"
            inputMode="decimal"
            defaultValue={plan ? centsToMoneyInput(plan.price_cents) : ""}
            required
          />
        </Field>
        <Field id={`${idPrefix}-extra`} label="Membro extra (R$)" hint="Use 0 se o plano não vende membro extra.">
          <Input
            id={`${idPrefix}-extra`}
            name="extraSeatPrice"
            inputMode="decimal"
            defaultValue={plan ? centsToMoneyInput(plan.extra_seat_price_cents) : "0"}
            required
          />
        </Field>
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-sm font-medium">Limites e recursos</legend>
        <p className="text-xs text-muted-foreground">Deixe um limite vazio para ilimitado.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          {PLAN_FEATURES.filter((feature) => feature.type === "limit").map((feature) => {
            const value = plan?.features[feature.key];
            const id = `${idPrefix}-${feature.key}`;
            return (
              <Field key={feature.key} id={id} label={feature.label}>
                <Input
                  id={id}
                  name={`feature:${feature.key}`}
                  inputMode="numeric"
                  defaultValue={typeof value === "number" ? String(value) : ""}
                  placeholder="Ilimitado"
                />
              </Field>
            );
          })}
        </div>
        <div className="flex flex-col gap-2">
          {PLAN_FEATURES.filter((feature) => feature.type === "flag").map((feature) => (
            <label key={feature.key} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name={`feature:${feature.key}`}
                defaultChecked={plan?.features[feature.key] === true}
                className="size-4"
              />
              {feature.label}
            </label>
          ))}
        </div>
      </fieldset>

      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Salvando..." : submitLabel}
      </Button>
    </form>
  );
}

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
