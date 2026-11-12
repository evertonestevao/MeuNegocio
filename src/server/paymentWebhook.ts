import "server-only";
import { reportError } from "@/adapters/errorReporting";
import { getPaymentGateway } from "@/adapters/payment";
import { toPublicError, isAppError } from "@/lib/errors";
import { endCompanyResellerLink, getCommissionService } from "@/modules/resellers/server";
import { createSupabaseAuditRepository } from "@/repositories/supabase/auditRepository";
import { createSupabaseBillingRepository } from "@/repositories/supabase/billingRepository";
import { createAuditService } from "@/services/auditService";
import { createBillingService } from "@/services/billingService";
import { getSupabaseAdminClient } from "./supabase-admin";

/**
 * Webhook de pagamento (qualquer gateway). O adapter valida a assinatura e
 * normaliza o evento; o service aplica na tabela subscriptions. Usa
 * service_role porque webhook não tem sessão de usuário — a segurança vem da
 * verificação de assinatura no adapter.
 */
export async function handlePaymentWebhook(request: Request): Promise<Response> {
  const payload = await request.text();

  try {
    const gateway = getPaymentGateway();
    // Cada adapter lê o próprio header de autenticação (Stripe-Signature, asaas-access-token...).
    const event = await gateway.handleWebhook({ payload, headers: request.headers });

    const admin = getSupabaseAdminClient();
    const billingRepo = createSupabaseBillingRepository(admin);
    const billing = createBillingService(billingRepo);
    const { endedSubscription } = await billing.applyPaymentEvent(event, gateway);

    // Depois do pagamento aplicado: falha de comissão vira pendência, não erro.
    await getCommissionService().processEvent(event);

    // Renovação do termo anual (12x): a última parcela foi paga. Cria o próximo termo
    // no gateway com o cartão tokenizado (sem o cliente pagar de novo) e aponta a
    // assinatura para ele. Falha aqui não derruba o webhook: o acesso do termo atual
    // segue até o fim; a renovação pode ser refeita.
    if (event.termRenewal && event.externalSubscriptionId) {
      try {
        const row = await billingRepo.findSubscriptionByExternalId(event.externalSubscriptionId);
        if (row) {
          const renewed = await gateway.renewSubscription({
            ...event.termRenewal,
            externalReference: `${row.company_id}:${row.plan_id}`,
          });
          await billing.applyRenewal(event.externalSubscriptionId, renewed);
        }
      } catch (renewErr) {
        await reportError(renewErr, { source: "route:/api/webhooks:renewal" });
      }
    }

    // Evento de sistema na trilha (user_id null): só quando conseguimos
    // atribuir a empresa; eventos "ignored" não sujam a auditoria.
    if (event.type !== "ignored" && event.companyId) {
      await createAuditService(createSupabaseAuditRepository(admin)).record({
        companyId: event.companyId,
        userId: null,
        action: event.type,
        entityType: "subscription",
        metadata: { gateway: event.gateway, plan_id: event.planId },
      });
    }

    if (endedSubscription) {
      await endCompanyResellerLink(endedSubscription.company_id);
      await createAuditService(createSupabaseAuditRepository(admin)).record({
        companyId: endedSubscription.company_id,
        userId: null,
        action: "subscription.ended_by_refund",
        entityType: "subscription",
        entityId: endedSubscription.id,
        metadata: { gateway: event.gateway, plan_id: endedSubscription.plan_id },
      });
    }

    return Response.json({ received: true });
  } catch (err) {
    // Log detalhado só no servidor; nunca o payload cru (regra do CLAUDE.md).
    // O reporter recebe só o erro, nunca o payload.
    await reportError(err, { source: "route:/api/webhooks" });
    const publicError = toPublicError(err);
    return Response.json({ error: publicError }, { status: isAppError(err) ? err.status : 500 });
  }
}
