import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getServerEnv } from "@/config/env";
import { plansForSale } from "@/config/planFeatures";
import { ProvisionCompanyForm } from "@/features/platform-companies/components/provision-company-form";
import { formatDate } from "@/lib/dates";
import { getPlanAdminService, getPlatformAdminId } from "@/server/plans";
import { getSupabaseAdminClient } from "@/server/supabase-admin";

export const metadata: Metadata = { title: "Empresas" };

const RECENT = 20;

export default async function CompaniesAdminPage() {
  if (!(await getPlatformAdminId())) redirect("/dashboard");

  const [plans, { data: companies }] = await Promise.all([
    getPlanAdminService().listActive(),
    getSupabaseAdminClient()
      .from("companies")
      .select("id, name, created_at")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(RECENT),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="font-heading text-2xl font-extrabold tracking-tight">Empresas</h2>
        <p className="text-sm text-muted-foreground">O cadastro público está fechado: novas empresas nascem aqui.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Nova empresa</CardTitle>
          <CardDescription>Cria a empresa e o acesso de quem vai ser o proprietário dela.</CardDescription>
        </CardHeader>
        <CardContent>
          <ProvisionCompanyForm plans={plansForSale(plans)} loginUrl={`${getServerEnv().APP_URL}/login`} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Últimas empresas</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col divide-y text-sm">
            {(companies ?? []).map((company) => (
              <li key={company.id} className="flex flex-wrap justify-between gap-2 py-2">
                <span className="min-w-0 font-medium break-words">{company.name}</span>
                <span className="text-muted-foreground">{formatDate(company.created_at)}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
