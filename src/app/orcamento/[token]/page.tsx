import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { PublicQuotePdfButton, PublicQuoteResponseForm } from "@/features/quotes/components/public-quote";
import { quoteItemDetail } from "@/features/quotes/pdf";
import { formatQuoteNumber } from "@/features/quotes/status";
import { formatDate, formatTimestamp } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { DEMO_QUOTE_TOKEN } from "@/config/demo";
import { canUsePublicApproval, getDemoPublicQuote, getPublicQuoteRepository } from "@/server/quotes";
import { createRateLimiter } from "@/server/rateLimit";
import { formatPhone } from "@/lib/masks";

export const metadata: Metadata = {
  title: "Orçamento",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

const viewLimiter = () => createRateLimiter({ limit: 60, windowMs: 60_000 });

export default async function PublicQuotePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const isDemo = DEMO_QUOTE_TOKEN.test(token);
  if (!isDemo && !/^[0-9a-f]{64}$/.test(token)) notFound();

  const requestHeaders = await headers();
  const ip = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "desconhecido";
  try {
    await viewLimiter().consume(`public-quote-view:${ip}`);
  } catch {
    notFound();
  }

  const quote = isDemo ? await getDemoPublicQuote(token) : await getPublicQuoteRepository().getByToken(token);
  if (!quote || (!isDemo && !(await canUsePublicApproval(quote.companyId)))) notFound();
  const { document, response } = quote;
  const canRespond = document.status === "sent" && quote.isWithinValidity;

  return (
    <main id="conteudo" className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-8">
      {isDemo ? (
        <p className="rounded-lg bg-warning/10 px-3 py-2 text-sm">
          Este é um orçamento de demonstração, com dados fictícios. É assim que o seu cliente recebe o link para aprovar.
        </p>
      ) : null}
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold break-words">{document.company.name}</h1>
        <p className="text-sm text-muted-foreground">
          {[document.company.phone ? formatPhone(document.company.phone) : null, document.company.email].filter(Boolean).join(" · ")}
        </p>
      </header>

      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap justify-between gap-3 text-sm">
            <div>
              <p className="font-medium">Orçamento Nº {formatQuoteNumber(document.number)}</p>
              <p className="text-muted-foreground">Emitido em {formatTimestamp(document.createdAt)}</p>
              <p className="text-muted-foreground">Válido até {formatDate(document.validUntil)}</p>
            </div>
            <div className="min-w-0">
              <p className="font-medium break-words">{document.client?.name}</p>
              {document.location ? (
                <p className="text-muted-foreground break-words">
                  {document.location.name} — {document.location.address}
                </p>
              ) : null}
            </div>
          </div>
          {document.title ? <h2 className="font-semibold break-words">{document.title}</h2> : null}
          <ul className="flex flex-col divide-y">
            {document.items.map((item, index) => (
              <li key={index} className="flex justify-between gap-4 py-2 text-sm">
                <div className="min-w-0">
                  <p className="break-words">{item.description}</p>
                  <p className="text-muted-foreground">{quoteItemDetail(item)}</p>
                </div>
                <span className="shrink-0 tabular-nums">{formatCents(item.lineTotalCents)}</span>
              </li>
            ))}
          </ul>
          <div className="flex flex-col gap-1 border-t pt-3 text-sm">
            {document.discountCents > 0 ? (
              <>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="tabular-nums">{formatCents(document.subtotalCents)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Desconto</span>
                  <span className="tabular-nums">- {formatCents(document.discountCents)}</span>
                </div>
              </>
            ) : null}
            <div className="flex justify-between text-base font-semibold">
              <span>Total</span>
              <span className="tabular-nums">{formatCents(document.totalCents)}</span>
            </div>
          </div>
          {document.notes ? (
            <div className="text-sm">
              <p className="font-medium">Condições</p>
              <p className="whitespace-pre-wrap text-muted-foreground">{document.notes}</p>
            </div>
          ) : null}
          <div>
            <PublicQuotePdfButton document={document} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          {canRespond ? (
            <PublicQuoteResponseForm token={token} companyName={document.company.name} />
          ) : (
            <div className="flex flex-col gap-1 text-sm">
              {document.status === "approved" || document.status === "closed" ? (
                <p className="font-medium">
                  Orçamento aprovado
                  {response?.decision === "approved" ? ` por ${response.name} em ${formatTimestamp(response.createdAt)}` : ""}.
                </p>
              ) : null}
              {document.status === "refused" ? (
                <p className="font-medium">
                  Orçamento recusado
                  {response?.decision === "refused" ? ` por ${response.name} em ${formatTimestamp(response.createdAt)}` : ""}.
                </p>
              ) : null}
              {document.status === "expired" || (document.status === "sent" && !quote.isWithinValidity) ? (
                <p className="font-medium">A validade deste orçamento terminou. Fale com a empresa para receber uma nova versão.</p>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
