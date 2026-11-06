import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { brand } from "@/config/brand";
import { AbuseReportForm } from "@/features/company/components/abuse-report-form";
import { getPublicQuoteRepository } from "@/server/quotes";

export const metadata: Metadata = { title: "Denunciar uso indevido", robots: { index: false, follow: false } };

/**
 * Denúncia pública: um cliente que recebeu cobrança suspeita, ou a empresa verdadeira que descobriu
 * alguém usando o nome dela. Do link de um orçamento, a empresa já vem identificada.
 */
export default async function ReportAbusePage({ searchParams }: { searchParams: Promise<{ orcamento?: string }> }) {
  const { orcamento } = await searchParams;
  const token = orcamento && /^[0-9a-f]{64}$/.test(orcamento) ? orcamento : null;
  const quote = token ? await getPublicQuoteRepository().getByToken(token) : null;

  return (
    <main id="conteudo" className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 py-10">
      <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
        ← {brand.name}
      </Link>
      <h1 className="font-heading text-3xl font-semibold tracking-tight">Denunciar uso indevido</h1>
      <p className="text-muted-foreground">
        Recebeu um orçamento ou cobrança que parece golpe? Alguém está usando o nome, o CNPJ ou o logo da sua empresa? Conte para a gente.
        Analisamos toda denúncia e podemos suspender a empresa enquanto apuramos.
      </p>
      <Card>
        <CardContent>
          <AbuseReportForm token={token} companyName={quote?.document.company.name ?? null} />
        </CardContent>
      </Card>
    </main>
  );
}
