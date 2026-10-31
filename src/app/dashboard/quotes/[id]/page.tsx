import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { QuoteActions } from "@/features/quotes/components/quote-actions";
import { QuoteEditor } from "@/features/quotes/components/quote-editor";
import { QUOTE_STATUS_LABEL, formatQuoteNumber } from "@/features/quotes/status";
import { formatTimestamp, todayInTimezone } from "@/lib/dates";
import { getClientService } from "@/server/clients";
import { buildQuoteDocument } from "@/server/quoteDocument";
import { loadQuoteEditorData } from "@/server/quoteEditorData";
import { canUsePublicApproval, getPublicQuoteUrl, getQuoteService } from "@/server/quotes";
import { getActiveTenant } from "@/server/tenant";
import { permissionService } from "@/services/permissionService";

export const metadata: Metadata = { title: "Orçamento" };

export default async function QuoteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { active } = await getActiveTenant();
  if (!active) return null;
  if (!permissionService.canManageQuotes(active.role)) redirect("/dashboard");
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const actor = { companyId: active.id, role: active.role };
  const service = await getQuoteService();
  const detail = await service.getDetail(actor, id);
  if (!detail) notFound();
  const { quote, items, responses, revenue } = detail;

  const [{ clients, catalog, profile }, clientDetail, allowsPublicLink] = await Promise.all([
    loadQuoteEditorData(actor),
    quote.client_id ? (await getClientService()).getDetail(actor, quote.client_id) : Promise.resolve(null),
    canUsePublicApproval(active.id),
  ]);
  const location = clientDetail?.locations.find((candidate) => candidate.id === quote.location_id) ?? null;
  const primaryContact = clientDetail?.contacts[0] ?? null;
  const dates = [
    `Criado em ${formatTimestamp(quote.created_at, profile.timezone)}`,
    quote.sent_at ? `enviado em ${formatTimestamp(quote.sent_at, profile.timezone)}` : null,
    quote.approved_at ? `aprovado em ${formatTimestamp(quote.approved_at, profile.timezone)}` : null,
    quote.refused_at ? `recusado em ${formatTimestamp(quote.refused_at, profile.timezone)}` : null,
    quote.closed_at ? `fechado em ${formatTimestamp(quote.closed_at, profile.timezone)}` : null,
  ].filter(Boolean);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Link href="/dashboard/quotes" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-4" /> Orçamentos
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-xl font-semibold tracking-tight">Orçamento Nº {formatQuoteNumber(quote.number)}</h2>
          <Badge variant={quote.status === "closed" ? "default" : "secondary"}>{QUOTE_STATUS_LABEL[quote.status]}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">{dates.join(" · ")}</p>
        {quote.status === "draft" ? null : (
          <p className="rounded-lg bg-muted px-3 py-2 text-sm">
            Este orçamento está {QUOTE_STATUS_LABEL[quote.status].toLowerCase()} e não pode mais ser editado. Use “Duplicar”
            para criar uma nova versão.
          </p>
        )}
        {responses.map((response) => (
          <Card key={response.id}>
            <CardContent className="text-sm">
              <p className="font-medium">
                {response.name} {response.decision === "approved" ? "aprovou" : "recusou"} pelo link em{" "}
                {formatTimestamp(response.created_at, profile.timezone)}
              </p>
              {response.comment ? <p className="text-muted-foreground">{response.comment}</p> : null}
            </CardContent>
          </Card>
        ))}
      </div>
      <QuoteEditor
        key={quote.updated_at}
        quote={quote}
        items={items}
        catalog={catalog}
        clients={clients}
        initial={{ clientId: null, validUntil: null, notes: "" }}
        aside={
          <QuoteActions
            key="actions"
            quote={quote}
            document={buildQuoteDocument({
              quote,
              items,
              companyName: active.name,
              profile,
              client: clientDetail?.client ?? null,
              location,
            })}
            contact={primaryContact ? { name: primaryContact.name, phone: primaryContact.phone } : null}
            publicUrl={allowsPublicLink ? getPublicQuoteUrl(quote.public_token) : null}
            revenue={revenue}
            canClose={permissionService.canCloseQuotes(active.role)}
            canDelete={permissionService.canDeleteRecords(active.role)}
            today={todayInTimezone(profile.timezone)}
          />
        }
      />
    </div>
  );
}
