import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { brand, salesWhatsappHref } from "@/config/brand";
import { CreateCompanyForm } from "@/features/companies/components/create-company-form";
import { getPlatformAdminId } from "@/server/plans";
import { isSignupOpen } from "@/server/signup";
import { getActiveTenant } from "@/server/tenant";
import { getTermsService } from "@/server/terms";

export const metadata: Metadata = { title: "Criar empresa" };

/**
 * Onboarding: caminho crítico signup → aceitar termos → criar empresa →
 * virar owner. Quem já tem empresa não passa por aqui.
 */
export default async function OnboardingPage() {
  const { companies } = await getActiveTenant();
  if (companies.length > 0) {
    redirect("/dashboard");
  }

  // Cadastro fechado: sem empresa e sem ser super admin, a conta depende de um convite.
  if (!isSignupOpen() && !(await getPlatformAdminId())) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-12 text-center">
        <Link href="/" className="text-2xl font-semibold tracking-tight">
          {brand.name}
        </Link>
        <h1 className="text-xl font-semibold tracking-tight">Sua conta ainda não tem empresa</h1>
        <p className="max-w-md text-muted-foreground">
          Peça um convite a quem administra a sua empresa ou{" "}
          <a href={salesWhatsappHref(`Olá! Quero contratar o ${brand.name}.`)} target="_blank" rel="noreferrer" className="underline underline-offset-4">
            fale conosco pelo WhatsApp
          </a>
          .
        </p>
      </div>
    );
  }

  const terms = await getTermsService();
  const requireTerms = !(await terms.hasAcceptedCurrent());

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-12">
      <Link href="/" className="mb-8 text-2xl font-semibold tracking-tight">
        {brand.name}
      </Link>
      <Card className="w-full max-w-xl">
        <CardHeader>
          <CardTitle>Crie sua empresa</CardTitle>
          <CardDescription>
            Todo dado do {brand.name} pertence a uma empresa. Você será o proprietário desta.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CreateCompanyForm requireTerms={requireTerms} withProfile />
        </CardContent>
      </Card>
    </div>
  );
}
