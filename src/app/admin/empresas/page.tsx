import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getServerEnv } from "@/config/env";
import { plansForSale } from "@/config/planFeatures";
import { ProvisionCompanyForm } from "@/features/platform-companies/components/provision-company-form";
import { CNPJ_RESULT_LABEL } from "@/features/platform-companies/labels";
import { formatDate } from "@/lib/dates";
import { getCompanyEvidenceReader } from "@/server/companyTrust";
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
      .select("id, name, created_at, suspended_at")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(RECENT),
  ]);
  const flags = await (await getCompanyEvidenceReader()).getFlags((companies ?? []).map((company) => company.id));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-extrabold tracking-tight">Empresas</h1>
        <p className="text-sm text-muted-foreground">Crie empresas com acesso do responsável e confira os comprovantes de cada uma.</p>
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
              <li key={company.id} className="flex flex-col gap-1.5 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                <Link href={`/admin/empresas/${company.id}`} className="min-w-0 font-medium break-words underline-offset-4 hover:underline">
                  {company.name}
                </Link>
                <span className="flex flex-wrap items-center gap-1.5">
                  {company.suspended_at ? <Badge variant="destructive">Suspensa</Badge> : null}
                  {flags[company.id]?.lastCheck && flags[company.id].lastCheck!.result !== "match" ? (
                    <Badge variant={CNPJ_RESULT_LABEL[flags[company.id].lastCheck!.result].tone}>{CNPJ_RESULT_LABEL[flags[company.id].lastCheck!.result].label}</Badge>
                  ) : null}
                  {flags[company.id]?.lastCheck?.declarant_in_partners === false ? <Badge variant="outline">Fora do quadro de sócios</Badge> : null}
                  {flags[company.id]?.reports ? <Badge variant="destructive">{flags[company.id].reports === 1 ? "1 denúncia" : `${flags[company.id].reports} denúncias`}</Badge> : null}
                  <span className="text-xs text-muted-foreground tabular-nums">{formatDate(company.created_at)}</span>
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
