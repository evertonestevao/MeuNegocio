"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getPaymentGateway } from "@/adapters/payment";
import { getServerEnv } from "@/config/env";
import { AppError } from "@/lib/errors";
import { endCompanyResellerLink, getCommissionService, linkCompanyAtCheckout } from "@/modules/resellers/server";
import { createSupabaseBillingRepository } from "@/repositories/supabase/billingRepository";
import { createSupabaseUserRepository } from "@/repositories/supabase/userRepository";
import { recordAudit } from "@/server/audit";
import { rejectInDemo } from "@/server/demo/mode";
import { getCompanyAccess, getExternalPriceId } from "@/server/billing";
import { getSupabaseAdminClient } from "@/server/supabase-admin";
import { getSupabaseServerClient } from "@/server/supabase-server";
import { getActiveTenant, getTenantService } from "@/server/tenant";
import { isOnboardingPending } from "@/server/signupFlow";
import { CARDLESS_TRIAL_OFFERED, createBillingService, isCardlessTrial, TRIAL_DAYS, trialEndsAt } from "@/services/billingService";
import { permissionService } from "@/services/permissionService";
import { createUserService } from "@/services/userService";
import type { NormalizedPaymentEvent } from "@/types/billing";
import { toActionError, type ActionState } from "./action-state";

/** Server actions de billing — toda ação revalida que o ator é owner. */

async function requireOwner(companyId: string) {
  // O gateway de pagamento fica fora do banco: a demonstração para antes de chegar nele.
  await rejectInDemo();
  const tenant = await getTenantService();
  const role = await tenant.requireMembership(companyId);
  if (!permissionService.canManageBilling(role)) {
    throw new AppError("forbidden", "Só o proprietário gerencia a assinatura");
  }
}

export async function checkoutAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  let checkoutUrl: string;
  try {
    const companyId = String(formData.get("companyId") ?? "");
    const planId = String(formData.get("planId") ?? "");
    await requireOwner(companyId);
    const gateway = getPaymentGateway();
    // Teste com cartão: só se a empresa nunca testou e o gateway adia a primeira cobrança.
    const withTrial = formData.get("trial") === "1" && gateway.supportsTrial && (await getCompanyAccess(companyId)).trialAvailable;

    const client = await getSupabaseServerClient();
    const repo = createSupabaseBillingRepository(client);
    const [{ data: userData }, plan, profile] = await Promise.all([
      client.auth.getUser(),
      repo.getPlanById(planId),
      createUserService(createSupabaseUserRepository(client)).getMyProfile(),
    ]);
    if (!userData.user?.email) {
      throw new AppError("unauthorized", "Sessão expirada");
    }
    if (!plan) {
      throw new AppError("not_found", "Plano não encontrado");
    }

    // Antes de cobrar: o primeiro pagamento já precisa encontrar o vínculo.
    await linkCompanyAtCheckout(companyId, plan.id);

    const appUrl = getServerEnv().APP_URL;
    const session = await gateway.createCheckout({
      companyId,
      plan: {
        id: plan.id,
        code: plan.code,
        name: plan.name,
        priceCents: plan.price_cents,
        currency: plan.currency,
        billingInterval: plan.billing_interval,
        // Só gateways com catálogo usam (PAYMENT_PRICE_<CODE>) — ver src/server/billing.ts.
        externalPriceId: getExternalPriceId(plan.code),
        paymentMethods: plan.payment_methods,
      },
      customer: { email: userData.user.email, name: profile?.full_name ?? null },
      // Tela de confirmação: espera o webhook ativar e então leva ao passo certo (não pode cair
      // direto no painel, que redireciona para /assinar enquanto a assinatura não está ativa).
      successUrl: `${appUrl}/assinar/confirmando`,
      cancelUrl: `${appUrl}/assinar`,
      trialDays: withTrial && plan.billing_interval === "month" ? TRIAL_DAYS : undefined,
    });
    checkoutUrl = session.url;
    await recordAudit({
      companyId,
      action: "subscription.checkout_started",
      entityType: "subscription",
      metadata: { plan_id: planId, gateway: gateway.name },
    });
  } catch (err) {
    return toActionError(err);
  }
  redirect(checkoutUrl);
}

/**
 * Pós-pagamento: a tela de confirmação chama isto em intervalos até a assinatura ativar (o webhook
 * é assíncrono). Diz se já há acesso e para onde ir: o passo da empresa, se o cadastro falta, ou o painel.
 */
export async function subscriptionConfirmationStatus(): Promise<{ active: boolean; next: string }> {
  const { active } = await getActiveTenant();
  if (!active) return { active: false, next: "/dashboard" };
  const [access, pending] = await Promise.all([getCompanyAccess(active.id), isOnboardingPending(active.id)]);
  return { active: access.hasAccess, next: pending ? "/onboarding" : "/dashboard" };
}

/**
 * Dev-only: com o gateway fake ativo, simula o webhook de ativação para o
 * template funcionar de ponta a ponta sem provedor real. Com gateway real
 * configurado, esta action recusa — a ativação vem do webhook assinado.
 */
export async function activateFakePlanAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  try {
    const companyId = String(formData.get("companyId") ?? "");
    const planId = String(formData.get("planId") ?? "");
    await requireOwner(companyId);

    if (getServerEnv().PAYMENT_GATEWAY !== "fake") {
      throw new AppError("forbidden", "Disponível apenas com o gateway fake (dev)");
    }

    // service_role: mesma via que o webhook real usaria (sem sessão de usuário).
    const repo = createSupabaseBillingRepository(getSupabaseAdminClient());
    const billing = createBillingService(repo);
    const plan = await repo.getPlanById(planId);
    if (!plan) {
      throw new AppError("not_found", "Plano não encontrado");
    }
    await linkCompanyAtCheckout(companyId, planId);
    const annual = plan.billing_interval === "year";
    // Teste com cartão simulado: em teste até o sétimo dia, quando o gateway cobraria.
    const trial = !annual && formData.get("trial") === "1" && (await getCompanyAccess(companyId)).trialAvailable ? trialEndsAt() : null;
    const event: NormalizedPaymentEvent = {
      type: "subscription.activated",
      gateway: "fake",
      // Cada compra anual é uma nova, como no parcelamento real.
      externalSubscriptionId: annual ? `fake_ins_${randomUUID()}` : `fake_${companyId}`,
      externalCustomerId: `fake_cus_${companyId}`,
      companyId,
      planId,
      currentPeriodStart: new Date().toISOString(),
      currentPeriodEnd: trial ?? new Date(Date.now() + (plan.billing_interval === "year" ? 365 : 30) * 24 * 60 * 60 * 1000).toISOString(),
      cancelAtPeriodEnd: false,
      nonRenewing: annual,
      trialEndsAt: trial,
      // No teste nada é cobrado: sem pagamento, sem comissão.
      payment: trial ? undefined : { externalId: `fake_pay_${randomUUID()}`, grossAmountCents: plan.price_cents },
    };
    await billing.applyPaymentEvent(event);
    await getCommissionService().processEvent(event);
    await recordAudit({
      companyId,
      action: "subscription.activated",
      entityType: "subscription",
      metadata: { plan_id: planId, gateway: "fake" },
    });
    revalidatePath("/dashboard", "layout");
    return { success: trial ? "Teste com cartão iniciado (simulação do gateway fake)" : "Plano ativado (simulação de webhook do gateway fake)" };
  } catch (err) {
    return toActionError(err);
  }
}

export async function cancelSubscriptionAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  try {
    const companyId = String(formData.get("companyId") ?? "");
    await requireOwner(companyId);

    // service_role: usuário não escreve em subscriptions; requireOwner já validou o ator.
    const repo = createSupabaseBillingRepository(getSupabaseAdminClient());
    const subscription = await repo.getActiveSubscription(companyId);
    if (!subscription) {
      throw new AppError("not_found", "Nenhuma assinatura ativa");
    }

    if (isCardlessTrial(subscription)) {
      throw new AppError("conflict", "O teste grátis termina sozinho, sem cobrança. Não há nada a cancelar.");
    }
    if (!subscription.renews) {
      throw new AppError("conflict", "Esta compra é parcelada e não renova sozinha. Para desistir, fale com o suporte.");
    }

    if (subscription.external_subscription_id) {
      await getPaymentGateway().cancelSubscription(subscription.external_subscription_id);
    }
    await repo.updateSubscription(subscription.id, {
      status: "canceled",
      cancel_at_period_end: true,
    });
    // O webhook também encerra; aqui cobre gateway sem webhook de cancelamento. Idempotente.
    await endCompanyResellerLink(companyId);
    await recordAudit({
      companyId,
      action: "subscription.canceled",
      entityType: "subscription",
      entityId: subscription.id,
      metadata: { plan_id: subscription.plan_id },
    });
    revalidatePath("/dashboard/billing");
    return { success: "Assinatura cancelada" };
  } catch (err) {
    return toActionError(err);
  }
}

/** Teste de 7 dias sem cartão, com tudo liberado. Um por empresa; só o proprietário inicia. */
export async function startTrialAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  try {
    if (!CARDLESS_TRIAL_OFFERED) throw new AppError("forbidden", "O teste sem cartão não está disponível.");
    const companyId = String(formData.get("companyId") ?? "");
    await requireOwner(companyId);
    // service_role: usuário não escreve em subscriptions; requireOwner já validou o ator.
    const subscription = await createBillingService(createSupabaseBillingRepository(getSupabaseAdminClient())).startCardlessTrial(companyId);
    await recordAudit({
      companyId,
      action: "subscription.trial_started",
      entityType: "subscription",
      entityId: subscription.id,
      metadata: { plan_id: subscription.plan_id, ends_at: subscription.current_period_end },
    });
  } catch (err) {
    return toActionError(err);
  }
  revalidatePath("/dashboard", "layout");
  redirect("/dashboard");
}
