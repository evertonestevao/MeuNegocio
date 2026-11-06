import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LeadForm } from "@/features/signup/components/lead-form";
import { SignupSteps } from "@/features/signup/components/signup-steps";
import { isSignupOpen } from "@/server/signup";
import { getSignupFlowService, SIGNUP_LEAD_COOKIE } from "@/server/signupFlow";
import { getSupabaseServerClient } from "@/server/supabase-server";
import { TRIAL_DAYS } from "@/services/billingService";

export const metadata: Metadata = { title: "Começar" };

/** Primeiro passo do cadastro: nome, e-mail e aceite, guardados na hora. Voltando para corrigir, já vem preenchido. */
export default async function StartSignupPage() {
  if (!isSignupOpen()) redirect("/login");
  const { data } = await (await getSupabaseServerClient()).auth.getUser();
  if (data.user) redirect("/dashboard");
  const lead = await getSignupFlowService().getPending((await cookies()).get(SIGNUP_LEAD_COOKIE)?.value);

  return (
    <Card>
      <CardHeader className="gap-4">
        <SignupSteps current={1} />
        <div className="flex flex-col gap-1.5">
          <CardTitle>Vamos começar</CardTitle>
          <CardDescription>Leva menos de dois minutos. Os dados da empresa ficam para o fim.</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <LeadForm
          trialDays={TRIAL_DAYS}
          initial={lead ? { fullName: lead.full_name, email: lead.email, emailConsent: lead.email_consent } : undefined}
        />
        <p className="text-center text-sm text-muted-foreground">
          Já tem conta?{" "}
          <Link href="/login" className="text-foreground underline underline-offset-4">
            Entrar
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
