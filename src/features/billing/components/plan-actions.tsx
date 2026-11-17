"use client";

import { useActionState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DialogForm } from "@/components/dialog-form";
import { Label } from "@/components/ui/label";
import { useTenant } from "@/providers/tenant-provider";
import {
  activateFakePlanAction,
  cancelSubscriptionAction,
  checkoutAction,
  scheduleSwitchAction,
} from "@/server/actions/billing";

/** Botão de assinar um plano. Com gateway fake, ativa direto (dev). */
export function SubscribeButton({
  planId,
  isFakeGateway,
  isCurrent,
}: {
  planId: string;
  isFakeGateway: boolean;
  isCurrent: boolean;
}) {
  const { active } = useTenant();
  const action = isFakeGateway ? activateFakePlanAction : checkoutAction;
  const [state, formAction, pending] = useActionState(action, undefined);

  if (isCurrent) {
    return (
      <Button disabled variant="secondary" className="w-full">
        Plano atual
      </Button>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="companyId" value={active.id} />
      <input type="hidden" name="planId" value={planId} />
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
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Processando..." : isFakeGateway ? "Ativar (teste)" : "Assinar"}
      </Button>
    </form>
  );
}

/** Botão de trocar de plano: a troca vale no fim do período já pago, nada muda hoje. */
export function SwitchPlanButton({ planId }: { planId: string }) {
  const { active } = useTenant();
  const [state, formAction, pending] = useActionState(scheduleSwitchAction, undefined);
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="companyId" value={active.id} />
      <input type="hidden" name="planId" value={planId} />
      {state?.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Agendando..." : "Trocar no fim do período"}
      </Button>
    </form>
  );
}

/** Motivos de cancelamento (lista fechada; o texto livre é opcional). */
export const CANCEL_REASONS: { value: string; label: string }[] = [
  { value: "expensive", label: "Ficou caro para o meu momento" },
  { value: "not_using", label: "Não estou usando o sistema" },
  { value: "missing_feature", label: "Falta algo de que eu preciso" },
  { value: "difficult", label: "Achei difícil de usar" },
  { value: "other_tool", label: "Vou usar outra ferramenta" },
  { value: "closing", label: "Encerrei ou pausei o negócio" },
  { value: "other", label: "Outro motivo" },
  { value: "no_answer", label: "Prefiro não informar" },
];

/**
 * Cancelar a assinatura: discreto de propósito (link de texto, sem destaque) e com confirmação em
 * diálogo, que explica o que acontece, pede o motivo (pode ficar "prefiro não informar") e exige
 * marcar que entendeu. Cancelar continua possível aqui mesmo, sem precisar falar com ninguém.
 */
export function CancelSubscriptionButton({ accessUntil }: { accessUntil: string }) {
  const { active } = useTenant();
  return (
    <DialogForm
      title="Cancelar assinatura"
      description={`Você mantém o acesso completo até ${accessUntil}, que é o fim do período já pago. Depois disso, o acesso fica pausado e os seus dados continuam guardados.`}
      action={cancelSubscriptionAction}
      submitLabel="Confirmar cancelamento"
      variant="destructive"
      trigger={(open) => (
        <button type="button" onClick={open} className="w-fit text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground">
          Quero cancelar minha assinatura
        </button>
      )}
    >
      <input type="hidden" name="companyId" value={active.id} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="cancel-reason">Por que você quer cancelar?</Label>
        <select
          id="cancel-reason"
          name="reason"
          required
          defaultValue=""
          className="h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm"
        >
          <option value="" disabled>
            Escolha uma opção
          </option>
          {CANCEL_REASONS.map((reason) => (
            <option key={reason.value} value={reason.value}>
              {reason.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="cancel-comment">Quer nos contar mais? (opcional)</Label>
        <textarea
          id="cancel-comment"
          name="comment"
          maxLength={500}
          rows={3}
          className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm"
        />
        <p className="text-xs text-muted-foreground">Não escreva dados pessoais, senhas nem dados de cartão. Usamos só para melhorar o sistema.</p>
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="confirm" value="1" required className="mt-1" />
        <span>Entendi que as cobranças param e que o acesso termina em {accessUntil}.</span>
      </label>
    </DialogForm>
  );
}
