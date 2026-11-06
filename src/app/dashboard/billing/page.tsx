import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Check, ChevronLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getServerEnv } from "@/config/env";
import { PLAN_FEATURES, describePlanFeature, planMonthlyCents, plansForSale } from "@/config/planFeatures";
import {
  CancelSubscriptionButton,
  SubscribeButton,
} from "@/features/billing/components/plan-actions";
import { AppError } from "@/lib/errors";
import { createSupabaseBillingRepository } from "@/repositories/supabase/billingRepository";
import { getSupabaseServerClient } from "@/server/supabase-server";
import { formatCents } from "@/lib/money";
import { nextChargeNotice } from "@/features/billing/charge-notice";
import { getActiveTenant } from "@/server/tenant";
import { createBillingService, hasPlanAccess, isCardlessTrial } from "@/services/billingService";
import { permissionService } from "@/services/permissionService";
import type { Plan } from "@/types/database";

const SUBSCRIPTION_STATUS_LABEL = {
  trialing: "em teste",
  active: "ativa",
  past_due: "em atraso",
  canceled: "cancelada",
  incomplete: "incompleta",
} as const;

export const metadata: Metadata = { title: "Assinatura" };

function formatPrice(plan: Plan): string {
  if (plan.price_cents === 0) return "Grátis";
  return `${formatCents(planMonthlyCents(plan), plan.currency)}/mês`;
}

function featureList(plan: Plan): string[] {
  return PLAN_FEATURES.map((feature) => describePlanFeature(feature, plan.features[feature.key]));
}

export default async function BillingPage() {
  const { active } = await getActiveTenant();
  if (!active) return null;
  if (!permissionService.canManageBilling(active.role)) {
    redirect("/dashboard");
  }

  const client = await getSupabaseServerClient();
  const repo = createSupabaseBillingRepository(client);
  const billing = createBillingService(repo);

  const [currentPlan, subscription, plans, seats] = await Promise.all([
    billing.getEffectivePlan(active.id),
    repo.getActiveSubscription(active.id),
    listPlans(),
    billing.getSeatUsage(active.id),
  ]);

  async function listPlans(): Promise<Plan[]> {
    const { data, error } = await client
      .from("plans")
      .select("*")
      .is("deleted_at", null)
      .eq("is_active", true)
      .order("price_cents", { ascending: true });
    if (error) throw new AppError("internal_error", "Falha ao listar planos", error);
    return (data ?? []) as Plan[];
  }

  const isFakeGateway = getServerEnv().PAYMENT_GATEWAY === "fake";
  // Compra parcelada não tem o que cancelar aqui: desistência passa pelo suporte.
  const hasActiveSubscription =
    subscription != null && subscription.renews && ["trialing", "active", "past_due"].includes(subscription.status);
  const inTrial = isCardlessTrial(subscription) && hasPlanAccess(subscription!);
  const prepaidWithAccess = subscription != null && !inTrial && !subscription.renews && subscription.status !== "canceled" && hasPlanAccess(subscription);
  const canceledWithAccess =
    subscription != null && subscription.status === "canceled" && hasPlanAccess(subscription);

  return (
    <div className="flex flex-col gap-6">
      <Link href="/dashboard/settings" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" /> Configurações
      </Link>
      <div>
        <h1 className="font-heading text-2xl font-extrabold tracking-tight">Assinatura</h1>
        <p className="text-sm text-muted-foreground">
          Plano atual: <span className="font-medium text-foreground">{currentPlan?.name ?? "—"}</span>
          {subscription ? ` · assinatura ${SUBSCRIPTION_STATUS_LABEL[subscription.status]}` : " · sem assinatura"}
        </p>
        {nextChargeNotice(subscription) ? <p className="mt-1 text-sm text-muted-foreground">{nextChargeNotice(subscription)}</p> : null}
        {inTrial ? (
          <p className="mt-1 text-sm text-muted-foreground">
            Teste grátis até {new Date(subscription!.current_period_end!).toLocaleDateString("pt-BR")}, sem cobrança.{" "}
            <Link href="/assinar" className="font-medium text-primary hover:underline">
              Assinar agora
            </Link>
          </p>
        ) : null}
        {prepaidWithAccess ? (
          <p className="mt-1 text-sm text-muted-foreground">
            Plano pago até {new Date(subscription.current_period_end!).toLocaleDateString("pt-BR")}, sem renovação automática.
            Depois disso, contrate de novo para continuar.
          </p>
        ) : null}
        {canceledWithAccess ? (
          <p className="mt-1 text-sm text-muted-foreground">
            Assinatura cancelada. Acesso ao plano até{" "}
            {new Date(subscription.current_period_end!).toLocaleDateString("pt-BR")}. Depois disso, o acesso
            fica pausado até assinar de novo, e os dados continuam guardados.
          </p>
        ) : null}
      </div>

      {isFakeGateway ? (
        <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
          Modo de teste ativo: assinar um plano apenas simula o pagamento. Para cobrar de verdade, configure o
          provedor de pagamento.
        </p>
      ) : null}

      {/* Exceder o plano cobra a mais, se ele vender membro extra. */}
      <Card>
        <CardHeader>
          <CardTitle>Vagas de membros</CardTitle>
          <CardDescription>
            Membros ativos e convites pendentes ocupam vaga. Se o plano vende membro extra, o que
            passar do incluso é cobrado por pessoa. Se não vende, novos convites são recusados.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm">
          {seats.included === null ? (
            <p>
              <span className="font-medium text-foreground">{seats.used}</span> vagas em uso ·
              plano sem limite de membros
            </p>
          ) : (
            <p>
              <span className="font-medium text-foreground">{seats.included}</span> inclusos no
              plano + <span className="font-medium text-foreground">{seats.extraSeats}</span>{" "}
              extras ={" "}
              <span className="font-medium text-foreground">
                {formatCents(currentPlan ? planMonthlyCents(currentPlan, seats.extraCostCents) : seats.extraCostCents, currentPlan?.currency)}
                /mês
              </span>{" "}
              em vagas extras ({seats.used} em uso no total)
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {plansForSale(plans).map((plan) => {
          // No teste grátis, o plano em teste ainda pode ser assinado.
          const isCurrent = currentPlan?.id === plan.id && !inTrial;
          return (
            <Card key={plan.id} className={isCurrent ? "border-primary" : undefined}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  {plan.name}
                  {isCurrent ? <Badge>Atual</Badge> : null}
                </CardTitle>
                <CardDescription className="text-lg font-semibold text-foreground">
                  {formatPrice(plan)}
                  {plan.billing_interval === "year" ? (
                    <span className="block text-sm font-normal text-muted-foreground">
                      12x no cartão, total de {formatCents(plan.price_cents, plan.currency)}. Vale por 12 meses, sem renovação automática.
                    </span>
                  ) : null}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-4">
                <ul className="flex flex-col gap-1.5 text-sm text-muted-foreground">
                  {featureList(plan).map((feature) => (
                    <li key={feature} className="flex items-center gap-2">
                      <Check className="size-3.5 text-primary" aria-hidden />
                      {feature}
                    </li>
                  ))}
                </ul>
                {plan.custom_text ? <p className="whitespace-pre-line text-sm text-muted-foreground">{plan.custom_text}</p> : null}
                <div className="mt-auto">
                  {plan.code === "free" ? (
                    isCurrent ? (
                      <Badge variant="secondary">Plano padrão sem assinatura</Badge>
                    ) : null
                  ) : (
                    <SubscribeButton
                      planId={plan.id}
                      isFakeGateway={isFakeGateway}
                      // Cancelada: ainda é o plano em uso, mas pode assinar de novo.
                      isCurrent={isCurrent && !canceledWithAccess}
                    />
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {hasActiveSubscription ? (
        <Card>
          <CardHeader>
            <CardTitle>Gerenciar assinatura</CardTitle>
            <CardDescription>
              O cancelamento mantém o acesso até o fim do período já pago.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CancelSubscriptionButton />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
