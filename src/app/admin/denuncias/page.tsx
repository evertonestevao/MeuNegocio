import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ABUSE_REASONS } from "@/features/company/declaration";
import { formatDateTimeSeconds } from "@/lib/dates";
import { getCompanyEvidenceReader } from "@/server/companyTrust";
import { getPlatformAdminId } from "@/server/plans";

export const metadata: Metadata = { title: "Denúncias" };

/** Denúncias de uso indevido, das mais recentes. Ficam guardadas para sempre como prova. */
export default async function AbuseReportsAdminPage() {
  if (!(await getPlatformAdminId())) redirect("/dashboard");
  const reports = await (await getCompanyEvidenceReader()).listReports(100);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="font-heading text-2xl font-extrabold tracking-tight">Denúncias</h2>
        <p className="text-sm text-muted-foreground">Enviadas pelo link do orçamento ou pela página “Denunciar uso indevido”. Ninguém consegue apagar.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{reports.length === 1 ? "1 denúncia" : `${reports.length} denúncias`}</CardTitle>
          <CardDescription>Abra a empresa para ver os comprovantes e, se for o caso, suspender.</CardDescription>
        </CardHeader>
        <CardContent>
          {reports.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma denúncia até agora.</p>
          ) : (
            <ul className="flex flex-col divide-y text-sm">
              {reports.map((report) => (
                <li key={report.id} className="flex flex-col gap-1.5 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    {report.company_id ? (
                      <Link href={`/admin/empresas/${report.company_id}`} className="font-medium underline-offset-4 hover:underline">
                        {report.company_name ?? "Empresa"}
                      </Link>
                    ) : (
                      <span className="font-medium">{report.company_name ?? "Empresa não identificada"}</span>
                    )}
                    <span className="text-xs text-muted-foreground tabular-nums">{formatDateTimeSeconds(report.created_at)}</span>
                  </div>
                  <Badge variant="outline" className="w-fit">
                    {ABUSE_REASONS[report.reason]}
                  </Badge>
                  <p className="whitespace-pre-wrap break-words">{report.message}</p>
                  <p className="text-xs text-muted-foreground break-all">
                    {[report.reporter_name, report.reporter_contact].filter(Boolean).join(" · ")} · IP {report.ip_address ?? "—"}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
