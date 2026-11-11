import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PaymentConfirming } from "@/features/billing/components/payment-confirming";
import { SignupSteps } from "@/features/signup/components/signup-steps";
import { getCompanyAccess } from "@/server/billing";
import { getDemoProfile } from "@/server/demo/mode";
import { isOnboardingPending } from "@/server/signupFlow";
import { getSupabaseServerClient } from "@/server/supabase-server";
import { getActiveTenant } from "@/server/tenant";

export const metadata: Metadata = { title: "Confirmando pagamento" };

/** Retorno do gateway depois de pagar: espera a assinatura ativar (webhook) e segue para o passo certo. */
export default async function PaymentConfirmingPage() {
  if ((await getDemoProfile()) !== null) redirect("/dashboard");
  const client = await getSupabaseServerClient();
  const { data } = await client.auth.getUser();
  if (!data.user) redirect("/login");
  const { active } = await getActiveTenant();
  if (!active) redirect("/dashboard");

  const [access, pending] = await Promise.all([getCompanyAccess(active.id), isOnboardingPending(active.id)]);
  // Webhook já chegou: não precisa esperar.
  if (access.hasAccess) redirect(pending ? "/onboarding" : "/dashboard");

  return (
    <div data-wide className="flex flex-col gap-6">
      {pending ? <SignupSteps current={3} /> : null}
      <PaymentConfirming />
    </div>
  );
}
