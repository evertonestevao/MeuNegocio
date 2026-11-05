import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getPaymentGateway } from "@/adapters/payment";
import { CompanySwitcher } from "@/components/app-shell/company-switcher";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { brand } from "@/config/brand";
import { getServerEnv } from "@/config/env";
import { annualSavingsCents, planMonthlyCents, planOfferLines, plansForSale } from "@/config/planFeatures";
import { SubscribePanel } from "@/features/billing/components/subscribe-panel";
import { formatDate } from "@/lib/dates";
import { AppError } from "@/lib/errors";
import { TenantProvider } from "@/providers/tenant-provider";
import { signOutAction } from "@/server/actions/auth";
import { getCompanyAccess } from "@/server/billing";
import { getDemoProfile } from "@/server/demo/mode";
import { getSupabaseServerClient } from "@/server/supabase-server";
import { getActiveTenant } from "@/server/tenant";
import { TRIAL_DAYS, trialEndsAt } from "@/services/billingService";
import { permissionService } from "@/services/permissionService";
import type { Plan } from "@/types/database";

export const metadata: Metadata = { title: "Assinar" };

const GATEWAY_LABEL: Record<string, string> = { asaas: "Asaas", stripe: "Stripe", fake: "ambiente de teste" };

/**
 * Tela de assinar: aparece quando a empresa não tem assinatura válida (antes do primeiro teste ou
 * depois que ele acaba). Os dados ficam guardados; ao assinar, tudo volta como estava.
 */
export default async function SubscribePage() {
  if ((await getDemoProfile()) !== null) redirect("/dashboard");
  const client = await getSupabaseServerClient();
  const { data: userData } = await client.auth.getUser();
  if (!userData.user) redirect("/login");
  const { companies, active } = await getActiveTenant();
  if (!active) redirect("/dashboard");

  const access = await getCompanyAccess(active.id);
  // Com acesso pago ou teste com cartão, não há o que assinar aqui. No teste sem cartão, dá para assinar antes do fim.
  if (access.hasAccess && !access.inCardlessTrial) redirect("/dashboard");

  const { data, error } = await client.from("plans").select("*").is("deleted_at", null).eq("is_active", true);
  if (error) throw new AppError("internal_error", "Falha ao listar planos", error);
  const forSale = plansForSale((data ?? []) as Plan[]);
  // Anual e mensal: o mensal primeiro, porque é ele que tem o teste com cartão.
  const plans = forSale
    .map((plan) => ({ id: plan.id, name: plan.name, interval: plan.billing_interval, priceCents: plan.price_cents, monthlyCents: planMonthlyCents(plan) }))
    .toSorted((a, b) => Number(a.interval === "year") - Number(b.interval === "year"));
  const featured = forSale.find((plan) => plan.billing_interval === "month") ?? forSale[0];

  const canSubscribe = permissionService.canManageBilling(active.role);
  const gateway = getPaymentGateway();
  const isFakeGateway = getServerEnv().PAYMENT_GATEWAY === "fake";
  const ended = !access.hasAccess && !access.trialAvailable;

  return (
    <TenantProvider value={{ companies, active }}>
      <main id="conteudo" className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8 sm:py-12">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <span className="font-heading text-xl font-extrabold">{brand.name}</span>
          <div className="flex items-center gap-2">
            {companies.length > 1 ? <CompanySwitcher canCreate={false} /> : null}
            <form action={signOutAction}>
              <Button type="submit" variant="ghost" size="sm">
                Sair
              </Button>
            </form>
          </div>
        </header>

        <div className="flex flex-col gap-2">
          <h1 className="font-heading text-3xl font-extrabold tracking-tight">Assine o {brand.name}</h1>
          <p className="text-muted-foreground">
            {access.inCardlessTrial && access.trialEndsAt
              ? `Seu teste grátis vai até ${formatDate(access.trialEndsAt.slice(0, 10))}. Assine agora e continue sem interrupção.`
              : ended
                ? `O acesso da ${active.name} está pausado. Seus dados continuam guardados: assine e tudo volta como estava.`
                : `Orçamentos, agenda, ordem de serviço e financeiro da ${active.name} em um só lugar.`}
          </p>
        </div>

        {canSubscribe ? (
          <SubscribePanel
            companyId={active.id}
            plans={plans}
            included={featured ? planOfferLines(featured.features) : []}
            savingsCents={annualSavingsCents(forSale)}
            trialAvailable={access.trialAvailable}
            cardTrial={gateway.supportsTrial}
            firstChargeDate={formatDate(trialEndsAt().slice(0, 10))}
            gatewayName={GATEWAY_LABEL[gateway.name] ?? gateway.name}
            isFakeGateway={isFakeGateway}
          />
        ) : (
          <Card>
            <CardContent className="flex flex-col gap-2 text-sm">
              <p className="font-medium">Quem assina é o proprietário da empresa.</p>
              <p className="text-muted-foreground">
                Peça ao proprietário da {active.name} para assinar o {brand.name}
                {access.trialAvailable ? ` ou começar o teste grátis de ${TRIAL_DAYS} dias` : ""}. Os dados continuam guardados enquanto isso.
              </p>
            </CardContent>
          </Card>
        )}

        {access.inCardlessTrial ? (
          <Link href="/dashboard" className="self-center text-sm font-medium text-primary hover:underline">
            Voltar ao sistema
          </Link>
        ) : null}
      </main>
    </TenantProvider>
  );
}
