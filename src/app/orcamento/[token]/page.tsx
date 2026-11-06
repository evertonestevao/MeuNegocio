import type { Metadata } from "next";
import { headers } from "next/headers";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { PublicQuotePdfButton, PublicQuoteResponseForm } from "@/features/quotes/components/public-quote";
import { quoteItemDetail } from "@/features/quotes/pdf";
import { formatQuoteNumber } from "@/features/quotes/status";
import { formatDate, formatTimestamp } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { brand } from "@/config/brand";
import { DEMO_QUOTE_TOKEN } from "@/config/demo";
import { canUsePublicApproval, getDemoPublicQuote, getPublicQuoteRepository, getPublicQuoteSignatureUrl } from "@/server/quotes";
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
  if (!quote) notFound();
  // Empresa sem assinatura (teste acabou): o cliente ainda vê o orçamento que recebeu, mas não responde por aqui.
  const respondsOnline = isDemo || (await canUsePublicApproval(quote.companyId));
  const { response } = quote;
  const canRespond = respondsOnline && quote.document.status === "sent" && quote.isWithinValidity;
  // Aprovado: a resposta do cliente, com a assinatura, entra na página e no PDF.
  const approved = response?.decision === "approved" && (quote.document.status === "approved" || quote.document.status === "closed");
  const signatureUrl = approved && response.signaturePath
    ? isDemo
      ? response.signaturePath
      : await getPublicQuoteSignatureUrl(quote, response.signaturePath)
    : null;
  const document = approved
    ? { ...quote.document, approval: { name: response.name, comment: response.comment, approvedAt: response.createdAt, signatureUrl } }
    : quote.document;

  return (
    <main id="conteudo" className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-8">
      {isDemo ? (
        <p className="rounded-lg bg-warning/10 px-3 py-2 text-sm">
          Este é um orçamento de demonstração, com dados fictícios. É assim que o seu cliente recebe o link para aprovar.
        </p>
      ) : null}
      <header className="flex flex-col gap-1">
        {document.company.logoUrl ? (
          <Image
            src={document.company.logoUrl}
            alt={`Logo da ${document.company.name}`}
            width={192}
            height={64}
            unoptimized
            className="mb-2 h-14 w-auto max-w-48 object-contain object-left"
          />
        ) : null}
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
          {document.paymentTerms ? (
            <p className="rounded-lg bg-muted px-3 py-2 text-sm">
              <span className="text-muted-foreground">Condições de pagamento: </span>
              <strong>{document.paymentTerms}</strong>
            </p>
          ) : null}
          {document.notes ? (
            <div className="text-sm">
              <p className="font-medium">Condições</p>
              <p className="whitespace-pre-wrap text-muted-foreground">{document.notes}</p>
            </div>
          ) : null}
          {/* Aprovado, os botões ficam junto da assinatura, mais abaixo. */}
          {approved ? null : (
            <div>
              <PublicQuotePdfButton document={document} />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          {canRespond ? (
            <PublicQuoteResponseForm token={token} companyName={document.company.name} />
          ) : (
            <div className="flex flex-col gap-1 text-sm">
              {approved ? (
                <div className="flex flex-col gap-3">
                  <h2 className="text-lg font-semibold">Orçamento aprovado</h2>
                  {signatureUrl ? (
                    <Image
                      src={signatureUrl}
                      alt={`Assinatura de ${response.name}`}
                      width={400}
                      height={150}
                      unoptimized
                      className="w-full max-w-sm rounded-lg border bg-white"
                    />
                  ) : null}
                  <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-[auto_1fr]">
                    <dt className="text-muted-foreground">Aprovado por</dt>
                    <dd className="font-medium break-words">{response.name}</dd>
                    <dt className="text-muted-foreground">Data</dt>
                    <dd>{formatTimestamp(response.createdAt)}</dd>
                    {response.comment ? (
                      <>
                        <dt className="text-muted-foreground">Observação</dt>
                        <dd className="whitespace-pre-wrap break-words">{response.comment}</dd>
                      </>
                    ) : null}
                  </dl>
                  <div>
                    <PublicQuotePdfButton document={document} />
                  </div>
                  <p className="text-muted-foreground">O PDF e a impressão já levam a sua assinatura.</p>
                </div>
              ) : document.status === "approved" || document.status === "closed" ? (
                <p className="font-medium">Orçamento aprovado.</p>
              ) : null}
              {document.status === "refused" ? (
                <p className="font-medium">
                  Orçamento recusado
                  {response?.decision === "refused" ? ` por ${response.name} em ${formatTimestamp(response.createdAt)}` : ""}.
                </p>
              ) : null}
              {!respondsOnline && document.status === "sent" && quote.isWithinValidity ? (
                <p className="font-medium">Para aprovar este orçamento, fale direto com a {document.company.name}.</p>
              ) : null}
              {document.status === "expired" || (document.status === "sent" && !quote.isWithinValidity) ? (
                <p className="font-medium">A validade deste orçamento terminou. Fale com a empresa para receber uma nova versão.</p>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>
      {isDemo ? null : (
        <p className="text-center text-xs text-muted-foreground">
          Este orçamento foi emitido pela {document.company.name} pelo {brand.name}. Desconfia dele?{" "}
          <Link href={`/denunciar?orcamento=${token}`} className="underline underline-offset-4 hover:text-foreground">
            Denunciar uso indevido
          </Link>
        </p>
      )}
    </main>
  );
}
