import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/password-input";
import { AuthForm } from "@/features/auth/components/auth-form";
import { SignupSteps } from "@/features/signup/components/signup-steps";
import { createAccountAction } from "@/server/actions/signup";
import { isSignupOpen } from "@/server/signup";
import { getSignupFlowService, SIGNUP_LEAD_COOKIE } from "@/server/signupFlow";
import { TRIAL_DAYS } from "@/services/billingService";

export const metadata: Metadata = { title: "Criar senha" };

/** Segundo passo: a senha cria a conta. O e-mail vem do primeiro passo e não muda aqui. */
export default async function CreatePasswordPage() {
  if (!isSignupOpen()) redirect("/login");
  const lead = await getSignupFlowService().getPending((await cookies()).get(SIGNUP_LEAD_COOKIE)?.value);
  if (!lead) redirect("/comecar");
  const firstName = lead.full_name.split(/\s+/)[0];

  return (
    <Card>
      <CardHeader className="gap-4">
        <SignupSteps current={2} />
        <div className="flex flex-col gap-1.5">
          <CardTitle>Olá, {firstName}! Crie sua senha</CardTitle>
          <CardDescription>
            Com ela, você entra no sistema. Em seguida, escolha o plano: os primeiros {TRIAL_DAYS} dias são grátis.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <AuthForm action={createAccountAction} submitLabel="Criar conta e escolher o plano">
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" type="email" value={lead.email} autoComplete="username" readOnly className="bg-muted" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">Senha</Label>
            <PasswordInput id="password" name="password" autoComplete="new-password" minLength={8} maxLength={72} required autoFocus />
            <p className="text-xs text-muted-foreground">Pelo menos 8 caracteres.</p>
          </div>
        </AuthForm>
        <p className="text-center text-sm text-muted-foreground">
          Nome ou e-mail errado?{" "}
          <Link href="/comecar" className="text-foreground underline underline-offset-4">
            Corrigir
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
