import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ABUSE_REASONS } from "@/features/company/declaration";
import { CompanySuspensionForm } from "@/features/platform-companies/components/company-suspension-form";
import { CNPJ_RESULT_LABEL, partnersLabel } from "@/features/platform-companies/labels";
import { formatDate, formatDateTimeSeconds } from "@/lib/dates";
import { formatDocument } from "@/lib/masks";
import { getCompanyEvidenceReader } from "@/server/companyTrust";
import { getPlatformAdminId } from "@/server/plans";
import { getSupabaseAdminClient } from "@/server/supabase-admin";

export const metadata: Metadata = { title: "Comprovantes da empresa" };

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid gap-0.5 sm:grid-cols-[11rem_1fr] sm:gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{value}</dd>
    </div>
  );
}

/**
 * Tudo o que serve de prova sobre uma empresa: declarações de responsabilidade, conferências do CNPJ,
 * denúncias e o histórico de suspensão. Imprime limpo, para guardar em PDF ou anexar a um processo.
 */
export default async function CompanyEvidencePage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await getPlatformAdminId())) redirect("/dashboard");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();

  const admin = getSupabaseAdminClient();
  const [{ data: company }, { data: profile }, evidence] = await Promise.all([
    admin.from("companies").select("id, name, created_at, deleted_at, suspended_at, suspension_reason").eq("id", id).maybeSingle<{
      id: string; name: string; created_at: string; deleted_at: string | null; suspended_at: string | null; suspension_reason: string | null;
    }>(),
    admin.from("company_profiles").select("cnpj, phone, email, address").eq("company_id", id).maybeSingle<{ cnpj: string | null; phone: string | null; email: string | null; address: string | null }>(),
    (await getCompanyEvidenceReader()).getEvidence(id),
  ]);
  if (!company) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href="/admin/empresas" className="w-fit text-sm text-muted-foreground hover:text-foreground print:hidden">
          ← Empresas
        </Link>
        <h1 className="font-heading text-2xl font-extrabold tracking-tight break-words">{company.name}</h1>
        <div className="flex flex-wrap gap-2">
          {company.suspended_at ? <Badge variant="destructive">Suspensa desde {formatDateTimeSeconds(company.suspended_at)}</Badge> : <Badge variant="secondary">Ativa</Badge>}
          {company.deleted_at ? <Badge variant="outline">Encerrada em {formatDate(company.deleted_at)}</Badge> : null}
        </div>
        <p className="hidden text-xs text-muted-foreground print:block">Comprovantes gerados em {formatDateTimeSeconds(new Date().toISOString())}.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Dados da empresa</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="flex flex-col gap-2 text-sm">
            <Row label="Criada em" value={formatDateTimeSeconds(company.created_at)} />
            <Row label="CNPJ informado" value={profile?.cnpj ? formatDocument(profile.cnpj) : "—"} />
            <Row label="Telefone" value={profile?.phone ?? "—"} />
            <Row label="E-mail" value={profile?.email ?? "—"} />
            <Row label="Endereço" value={profile?.address ?? "—"} />
            <Row label="Identificador" value={<span className="font-mono text-xs">{company.id}</span>} />
            {company.suspended_at ? <Row label="Motivo da suspensão" value={company.suspension_reason} /> : null}
          </dl>
        </CardContent>
      </Card>

      <Card className="print:hidden">
        <CardHeader>
          <CardTitle>{company.suspended_at ? "Reativar" : "Suspender"}</CardTitle>
        </CardHeader>
        <CardContent>
          <CompanySuspensionForm companyId={company.id} suspended={Boolean(company.suspended_at)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Declarações de responsabilidade</CardTitle>
          <CardDescription>Marcadas por quem cadastrou a empresa. Texto exato, com data, IP e navegador.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col divide-y text-sm">
          {evidence.declarations.length === 0 ? <p className="text-muted-foreground">Nenhuma declaração (empresa anterior a esta regra ou criada pelo super admin).</p> : null}
          {evidence.declarations.map((declaration) => (
            <dl key={declaration.id} className="flex flex-col gap-2 py-3 first:pt-0">
              <Row label="Quando" value={formatDateTimeSeconds(declaration.declared_at)} />
              <Row label="Quem" value={`${declaration.user_name} · ${declaration.user_email}`} />
              <Row label="Empresa declarada" value={`${declaration.company_name}${declaration.cnpj ? ` · CNPJ ${formatDocument(declaration.cnpj)}` : ""}`} />
              <Row label="Texto" value={`“${declaration.statement}”`} />
              <Row label="IP" value={declaration.ip_address ?? "—"} />
              <Row label="Navegador" value={<span className="text-xs">{declaration.user_agent ?? "—"}</span>} />
            </dl>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Conferências do CNPJ</CardTitle>
          <CardDescription>Base pública da Receita Federal, consultada no cadastro e a cada troca de CNPJ.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col divide-y text-sm">
          {evidence.cnpjChecks.length === 0 ? <p className="text-muted-foreground">Nenhuma conferência (sem CNPJ informado).</p> : null}
          {evidence.cnpjChecks.map((check) => (
            <dl key={check.id} className="flex flex-col gap-2 py-3 first:pt-0">
              <Row label="Resultado" value={<Badge variant={CNPJ_RESULT_LABEL[check.result].tone}>{CNPJ_RESULT_LABEL[check.result].label}</Badge>} />
              <Row label="Quando" value={`${formatDateTimeSeconds(check.checked_at)} · fonte: ${check.source}`} />
              <Row label="CNPJ" value={formatDocument(check.cnpj)} />
              <Row label="Nome informado" value={check.informed_name} />
              <Row label="Razão social" value={check.official_name ?? "—"} />
              <Row label="Nome fantasia" value={check.trade_name ?? "—"} />
              <Row label="Situação" value={check.situation ?? "—"} />
              <Row label="Abertura" value={check.opened_on ? formatDate(check.opened_on) : "—"} />
              <Row label="Município" value={[check.city, check.state].filter(Boolean).join("/") || "—"} />
              <Row label="Quadro de sócios" value={partnersLabel(check.declarant_in_partners)} />
            </dl>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Denúncias</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col divide-y text-sm">
          {evidence.reports.length === 0 ? <p className="text-muted-foreground">Nenhuma denúncia.</p> : null}
          {evidence.reports.map((report) => (
            <dl key={report.id} className="flex flex-col gap-2 py-3 first:pt-0">
              <Row label="Quando" value={formatDateTimeSeconds(report.created_at)} />
              <Row label="Motivo" value={ABUSE_REASONS[report.reason]} />
              <Row label="Relato" value={<span className="whitespace-pre-wrap">{report.message}</span>} />
              <Row label="Quem denunciou" value={[report.reporter_name, report.reporter_contact].filter(Boolean).join(" · ")} />
              <Row label="Orçamento" value={report.quote_id ? <span className="font-mono text-xs">{report.quote_id}</span> : "—"} />
              <Row label="IP" value={report.ip_address ?? "—"} />
            </dl>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Histórico de suspensão</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col divide-y text-sm">
          {evidence.suspensionEvents.length === 0 ? <p className="text-muted-foreground">Nunca foi suspensa.</p> : null}
          {evidence.suspensionEvents.map((event) => (
            <dl key={event.id} className="flex flex-col gap-2 py-3 first:pt-0">
              <Row label="Quando" value={formatDateTimeSeconds(event.created_at)} />
              <Row label="O quê" value={event.action === "suspended" ? "Suspensa" : "Reativada"} />
              <Row label="Motivo" value={event.reason} />
              <Row label="Por" value={event.actor_email} />
            </dl>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
