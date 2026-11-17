"use client";

import { startTransition, useActionState, useRef, useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { MaskedInput } from "@/components/masked-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DEFAULT_TERM_PAYMENTS, PLAN_FEATURES, planCycleLabel } from "@/config/planFeatures";
import { PAYMENT_METHODS, DEFAULT_PAYMENT_METHODS, DEFAULT_TRIAL_DAYS } from "@/config/paymentMethods";
import { firstValidationMessage, parsePlanForm, planCodeSchema } from "@/features/plans/schemas";
import { centsToMoneyInput } from "@/lib/money";
import type { ActionState } from "@/server/actions/action-state";
import type { Plan } from "@/types/database";

type FormAction = (prev: ActionState | undefined, formData: FormData) => Promise<ActionState>;

const SELECT_CLASS =
  "border-input h-11 rounded-lg md:h-9 border bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

/** Sem `plan` cria um plano novo. Valida aqui antes de enviar; o servidor valida de novo. `onSaved` roda depois de salvar. */
export function PlanForm({ plan, action, submitLabel, onSaved }: { plan?: Plan; action: FormAction; submitLabel: string; onSaved?: () => void }) {
  const formRef = useRef<HTMLFormElement>(null);
  const idPrefix = plan?.id ?? "novo";
  // O tipo de cobrança e as parcelas só se escolhem na criação; na edição valem os do plano.
  const [interval, setInterval] = useState<"month" | "year">(plan?.billing_interval ?? "month");
  const annual = interval === "year";
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
        onSaved?.();
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
        {plan ? null : (
          <Field
            id={`${idPrefix}-interval`}
            label="Cobrança"
            hint="Não muda depois de criado. O anual é parcelado no cartão e renova sozinho ao fim do ciclo."
          >
            <select
              id={`${idPrefix}-interval`}
              name="billingInterval"
              value={interval}
              onChange={(event) => setInterval(event.target.value === "year" ? "year" : "month")}
              className={SELECT_CLASS}
            >
              <option value="month">Mensal</option>
              <option value="year">Anual (parcelado no cartão)</option>
            </select>
          </Field>
        )}
        {annual && !plan ? (
          <Field
            id={`${idPrefix}-term`}
            label="Parcelas do ciclo"
            hint={`De 1 a 12 cobranças mensais (padrão ${DEFAULT_TERM_PAYMENTS}). Ao pagar a última, o sistema renova sozinho com o cartão guardado. Não muda depois de criado.`}
          >
            <Input id={`${idPrefix}-term`} name="termPayments" inputMode="numeric" defaultValue={String(DEFAULT_TERM_PAYMENTS)} />
          </Field>
        ) : null}
        <Field
          id={`${idPrefix}-price`}
          label={annual ? "Preço do ciclo (total)" : "Preço por mês"}
          hint={annual ? "Cada parcela é o total dividido pelas parcelas, com no mínimo R$ 5,00." : undefined}
        >
          <MaskedInput mask="money"
            id={`${idPrefix}-price`}
            name="price"
            defaultValue={plan ? centsToMoneyInput(plan.price_cents) : ""}
            required
          />
        </Field>
        {annual ? (
          // O anual não vende membro extra: o campo some e vai zerado.
          <input type="hidden" name="extraSeatPrice" value="0,00" />
        ) : (
          <Field id={`${idPrefix}-extra`} label="Membro extra" hint="Use 0 se o plano não vende membro extra.">
            <MaskedInput mask="money"
              id={`${idPrefix}-extra`}
              name="extraSeatPrice"
              defaultValue={plan ? centsToMoneyInput(plan.extra_seat_price_cents) : "0"}
              required
            />
          </Field>
        )}
      </div>

      {plan && annual ? (
        <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
          Plano anual em {plan.term_payments} {plan.term_payments === 1 ? "parcela" : "parcelas"} mensais no cartão (por {planCycleLabel(plan)}).
          O tipo de cobrança e as parcelas não mudam depois de criados.
        </p>
      ) : null}

      <Field
        id={`${idPrefix}-custom-text`}
        label="Texto livre"
        hint="Aparece na oferta do plano, na página inicial e em Assinatura. Escreva o que quiser; as quebras de linha são mantidas."
      >
        <textarea
          id={`${idPrefix}-custom-text`}
          name="customText"
          maxLength={2000}
          defaultValue={plan?.custom_text ?? ""}
          className="border-input min-h-20 rounded-lg border bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
        />
      </Field>

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="isPrivate" defaultChecked={plan ? !plan.is_public : false} className="mt-0.5 size-4" />
        <span>
          <span className="font-medium">Plano privado</span>
          <span className="block text-xs text-muted-foreground">
            Não aparece para ninguém. Só quem tem o e-mail liberado vê e assina. A lista de e-mails fica no cartão do plano, depois de salvar.
          </span>
        </span>
      </label>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-sm font-medium">Cobrança</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          {annual ? (
            // O anual não tem teste grátis (o checkout cobra a 1ª parcela na hora): o campo some e vai zerado.
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label>Dias de teste grátis</Label>
              <input type="hidden" name="trialDays" value="0" />
              <p className="text-xs text-muted-foreground">O plano anual não tem teste grátis: a 1ª parcela é cobrada na hora.</p>
            </div>
          ) : (
            <Field id={`${idPrefix}-trial`} label="Dias de teste grátis" hint="Cobra só depois desse prazo. 0 = cobra na hora.">
              <Input
                id={`${idPrefix}-trial`}
                name="trialDays"
                inputMode="numeric"
                defaultValue={String(plan?.trial_days ?? DEFAULT_TRIAL_DAYS)}
                placeholder={String(DEFAULT_TRIAL_DAYS)}
              />
            </Field>
          )}
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label>Meios de pagamento</Label>
            <div className="flex flex-col gap-2 pt-1">
              {PAYMENT_METHODS.map((method) => {
                const checked = plan ? plan.payment_methods.includes(method.key) : DEFAULT_PAYMENT_METHODS.includes(method.key);
                return (
                  <label key={method.key} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name={`method:${method.key}`} defaultChecked={checked} className="size-4" />
                    {method.label}
                  </label>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">Vários meios: o cliente escolhe na tela do pagamento.</p>
          </div>
        </div>
      </fieldset>

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
