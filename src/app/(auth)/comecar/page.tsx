import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LeadForm } from "@/features/signup/components/lead-form";
import { SignupSteps } from "@/features/signup/components/signup-steps";
import { isSignupOpen } from "@/server/signup";
import { getSupabaseServerClient } from "@/server/supabase-server";
import { TRIAL_DAYS } from "@/services/billingService";

export const metadata: Metadata = { title: "Começar" };

/** Primeiro passo do cadastro: nome, e-mail e aceite, guardados na hora. */
export default async function StartSignupPage() {
  if (!isSignupOpen()) redirect("/login");
  const { data } = await (await getSupabaseServerClient()).auth.getUser();
  if (data.user) redirect("/dashboard");

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
        <LeadForm trialDays={TRIAL_DAYS} />
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
