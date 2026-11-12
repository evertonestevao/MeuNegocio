"use client";

import { startTransition, useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ShieldCheck } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { activateFakePlanAction, checkoutAction, startTrialAction } from "@/server/actions/billing";
import type { ActionState } from "@/server/actions/action-state";

export interface SubscribePlan {
  id: string;
  name: string;
  interval: "month" | "year";
  priceCents: number;
  monthlyCents: number;
  /** Dias de teste grátis do plano (0 = cobra na hora). */
  trialDays: number;
}

/** Data da 1ª cobrança (DD/MM/AAAA) para um teste de `trialDays` dias a partir de hoje. */
function firstChargeDate(trialDays: number): string {
  const date = new Date();
  date.setDate(date.getDate() + trialDays);
  const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  return formatDate(iso);
}

/**
 * Assinar com cartão em primeiro lugar: o teste de 7 dias com cartão é o botão grande. O teste sem
 * cartão, quando oferecido, fica no fim, para quem ainda está na dúvida.
 */
export function SubscribePanel({
  companyId,
  plans,
  included,
  savingsCents,
  trialAvailable,
  cardTrial,
  cardlessTrial,
  gatewayName,
  isFakeGateway,
  afterActivationHref = "/dashboard",
}: {
  companyId: string;
  plans: SubscribePlan[];
  included: string[];
  savingsCents: number;
  /** A empresa ainda não usou o teste grátis. */
  trialAvailable: boolean;
  /** O meio de pagamento guarda o cartão e só cobra depois do teste. */
  cardTrial: boolean;
  /** Oferece também o teste sem cartão (decisão comercial; ver CARDLESS_TRIAL_OFFERED). */
  cardlessTrial: boolean;
  gatewayName: string;
  isFakeGateway: boolean;
  /** Para onde vai depois da ativação na hora (gateway de testes). No cadastro, direto ao último passo. */
  afterActivationHref?: string;
}) {
  const router = useRouter();
  const monthly = plans.find((plan) => plan.interval === "month");
  const [selected, setSelected] = useState(monthly?.id ?? plans[0]?.id ?? "");
  const plan = plans.find((candidate) => candidate.id === selected) ?? plans[0];
  // Teste é do mensal e só quando o plano oferece dias de teste. Os dias são por plano.
  const trialDays = plan?.trialDays ?? 0;
  const withTrial = trialAvailable && cardTrial && plan?.interval === "month" && trialDays > 0;

  const [state, dispatch, pending] = useActionState(async (prev: ActionState | undefined, data: FormData) => {
    const result = await (isFakeGateway ? activateFakePlanAction : checkoutAction)(prev, data);
    // No gateway fake a ativação é na hora; no real, o checkout redireciona para o pagamento.
    if (result?.success) router.push(afterActivationHref);
    return result;
  }, undefined);
  const [trialState, startTrial, startingTrial] = useActionState(startTrialAction, undefined);

  if (!plan) return null;

  return (
    <div className="flex flex-col gap-6">
      <div role="radiogroup" aria-label="Plano" className="grid gap-3 sm:grid-cols-2">
        {plans.map((option) => {
          const on = option.id === plan.id;
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setSelected(option.id)}
              className={`flex flex-col gap-1 rounded-2xl border-2 bg-card p-4 text-left transition-colors ${on ? "border-primary" : "border-border hover:border-primary/50"}`}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="font-heading text-lg font-bold">{option.name}</span>
                {option.interval === "year" && savingsCents > 0 ? (
                  <span className="rounded-full bg-success/15 px-2 py-0.5 text-xs font-medium text-success">Economize {formatCents(savingsCents)}</span>
                ) : null}
              </span>
              <span className="font-heading text-2xl font-extrabold tabular-nums">
                {formatCents(option.monthlyCents)}
                <span className="text-sm font-medium text-muted-foreground">/mês</span>
              </span>
              <span className="text-xs text-muted-foreground">
                {option.interval === "year" ? `12x de ${formatCents(option.monthlyCents)}/mês no cartão. Renova sozinho.` : "Cobrança todo mês. Cancele quando quiser."}
              </span>
            </button>
          );
        })}
      </div>

      {included.length > 0 ? (
        <ul className="grid gap-2 text-sm sm:grid-cols-2">
          {included.map((line) => (
            <li key={line} className="flex items-center gap-2">
              <Check className="size-4 shrink-0 text-success" /> {line}
            </li>
          ))}
        </ul>
      ) : null}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          startTransition(() => dispatch(data));
        }}
        className="flex flex-col gap-2"
      >
        <input type="hidden" name="companyId" value={companyId} />
        <input type="hidden" name="planId" value={plan.id} />
        {withTrial ? <input type="hidden" name="trial" value="1" /> : null}
        {state?.error ? (
          <Alert variant="destructive">
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        ) : null}
        <Button type="submit" size="lg" disabled={pending} className="h-14 w-full text-base font-semibold md:h-14">
          {pending ? "Abrindo o pagamento..." : withTrial ? `Começar agora: ${trialDays} dias grátis` : `Assinar o plano ${plan.name}`}
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          {withTrial
            ? `Nada é cobrado hoje. A primeira cobrança de ${formatCents(plan.priceCents)} será em ${firstChargeDate(trialDays)}. Cancele antes e não paga nada.`
            : plan.interval === "year"
              ? `${formatCents(plan.monthlyCents)} por mês no cartão, durante 12 meses, renovando automaticamente a cada ano. A primeira é agora.`
              : `Cobrança agora de ${formatCents(plan.priceCents)}, e depois todo mês. Cancele quando quiser.`}
        </p>
        <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="size-3.5" />
          {isFakeGateway ? "Ambiente de teste: o pagamento é simulado." : `Pagamento seguro, processado pelo ${gatewayName}.`}
        </p>
      </form>

      {trialAvailable && cardlessTrial ? (
        <form
          action={startTrial}
          className="flex flex-col items-center gap-2 border-t pt-5 text-center text-sm"
        >
          <input type="hidden" name="companyId" value={companyId} />
          {trialState?.error ? (
            <Alert variant="destructive">
              <AlertDescription>{trialState.error}</AlertDescription>
            </Alert>
          ) : null}
          <p className="text-muted-foreground">
            Ainda na dúvida se quer assinar?{" "}
            <button type="submit" disabled={startingTrial} className="font-semibold text-primary underline-offset-4 hover:underline disabled:opacity-60">
              {startingTrial ? "Liberando..." : "Teste por 7 dias sem cartão"}
            </button>
          </p>
          <p className="text-xs text-muted-foreground">Tudo liberado. No fim, você escolhe se assina; nada é cobrado sem você decidir.</p>
        </form>
      ) : null}
    </div>
  );
}
