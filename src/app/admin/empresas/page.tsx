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
const FILTERED_LIMIT = 100;

/** Filtros vindos dos cartões de "Precisa da sua atenção" (mesmas regras de `admin_overview`). */
const COMPANY_FILTERS = {
  "testes-terminando": "Testes que terminam em até 7 dias",
  "em-atraso": "Cobranças em atraso",
  suspensas: "Empresas suspensas",
} as const;
type CompanyFilter = keyof typeof COMPANY_FILTERS;

function parseFilter(value: string | undefined): CompanyFilter | null {
  return value && value in COMPANY_FILTERS ? (value as CompanyFilter) : null;
}

/** Ids das empresas do filtro; null = sem filtro. */
async function companyIdsForFilter(filter: CompanyFilter | null): Promise<string[] | null> {
  if (!filter || filter === "suspensas") return null;
  const admin = getSupabaseAdminClient();
  const query = admin.from("subscriptions").select("company_id").is("deleted_at", null);
  const { data } =
    filter === "em-atraso"
      ? await query.eq("status", "past_due")
      : await query
          .eq("status", "trialing")
          .gte("current_period_end", new Date().toISOString())
          .lte("current_period_end", new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString());
  return [...new Set((data ?? []).map((row) => row.company_id))];
}

export default async function CompaniesAdminPage({ searchParams }: { searchParams: Promise<{ filtro?: string }> }) {
  if (!(await getPlatformAdminId())) redirect("/dashboard");

  const filter = parseFilter((await searchParams).filtro);
  const filteredIds = await companyIdsForFilter(filter);

  let companiesQuery = getSupabaseAdminClient()
    .from("companies")
    .select("id, name, created_at, suspended_at")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(filter ? FILTERED_LIMIT : RECENT);
  if (filter === "suspensas") companiesQuery = companiesQuery.not("suspended_at", "is", null);
  if (filteredIds) companiesQuery = companiesQuery.in("id", filteredIds);

  const [plans, { data: companies }] = await Promise.all([getPlanAdminService().listActive(), companiesQuery]);
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
          <CardTitle>{filter ? COMPANY_FILTERS[filter] : "Últimas empresas"}</CardTitle>
          {filter ? (
            <CardDescription>
              <Link href="/admin/empresas" className="underline underline-offset-4">
                Ver todas as empresas
              </Link>
            </CardDescription>
          ) : null}
        </CardHeader>
        <CardContent>
          {filter && (companies ?? []).length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma empresa nesse filtro.</p> : null}
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
