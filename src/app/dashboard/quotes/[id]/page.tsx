import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft, Eye, EyeOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { brand } from "@/config/brand";
import { getDemoProfile } from "@/server/demo/mode";
import { QuoteActions } from "@/features/quotes/components/quote-actions";
import { QuoteEditor } from "@/features/quotes/components/quote-editor";
import { QUOTE_STATUS_VARIANT, QUOTE_STATUS_LABEL, formatQuoteNumber, quoteViewText } from "@/features/quotes/status";
import { ReceivableList } from "@/features/receivables/components/receivable-list";
import { ServiceCostSection } from "@/features/service-costs/components/service-cost-section";
import { VisitRow } from "@/features/visits/components/visit-row";
import { formatTimestamp, todayInTimezone } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { cardFeesOf } from "@/lib/installments";
import { getClientService } from "@/server/clients";
import { buildQuoteDocument } from "@/server/quoteDocument";
import { loadQuoteEditorData } from "@/server/quoteEditorData";
import { canUsePublicApproval, getPublicQuoteUrl, getQuoteService, getQuoteSignatureUrl } from "@/server/quotes";
import { getEmployeeService, getVisitService } from "@/server/schedule";
import { getExpenseService } from "@/server/finance";
import { getReceivableService } from "@/server/receivables";
import { getServiceCostService, plannedCostCents } from "@/server/serviceCosts";
import { getTaxService } from "@/server/tax";
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
  const { quote, items, responses, revenue, view } = detail;

  const visits = await (await getVisitService()).list(actor, { quoteId: quote.id });
  const [{ clients, catalog, profile }, clientDetail, allowsPublicLink, companyTaxRateBps] = await Promise.all([
    loadQuoteEditorData(actor),
    quote.client_id ? (await getClientService()).getDetail(actor, quote.client_id) : Promise.resolve(null),
    canUsePublicApproval(active.id),
    // A alíquota guardada no orçamento vale mais; sem ela, a de hoje da empresa.
    quote.tax_rate_bps === null || quote.tax_rate_bps === undefined ? (await getTaxService()).getRate(actor) : Promise.resolve(null),
  ]);
  // Assinaturas de quem aprovou pelo link; sem o arquivo, a resposta aparece sem a imagem.
  const signatureUrls = new Map(
    await Promise.all(
      responses
        .filter((response) => response.signature_path)
        .map(async (response) => [response.id, await getQuoteSignatureUrl(response.signature_path!).catch(() => null)] as const),
    ),
  );
  const approvalResponse = responses.find((response) => response.decision === "approved") ?? null;
  const location = clientDetail?.locations.find((candidate) => candidate.id === quote.location_id) ?? null;
  const primaryContact = clientDetail?.contacts[0] ?? null;
  // Na demonstração os telefones são inventados: o WhatsApp não pode abrir conversa com um número de verdade.
  const isDemo = (await getDemoProfile()) !== null;
  // Custos e resultado: só depois de aprovado, e só para quem vê o financeiro.
  const today = todayInTimezone(profile.timezone);
  const showCosts = (quote.status === "approved" || quote.status === "closed") && permissionService.canManageFinance(active.role);
  const targetMarginPercent = profile.target_margin_percent ?? 20;
  // Parcelas do serviço fechado: o que já entrou e o que falta receber.
  const receivables =
    quote.status === "closed" && permissionService.canManageFinance(active.role) ? await (await getReceivableService()).listByQuote(actor, quote.id) : null;
  const costs = showCosts
    ? await (async () => {
        const costService = await getServiceCostService();
        const expenseService = await getExpenseService();
        const [cost, categories, employees, quoteOptions, suppliers] = await Promise.all([
          costService.getForQuote(actor, { id: quote.id, totalCents: quote.total_cents, plannedCostCents: plannedCostCents(items, catalog) }, targetMarginPercent),
          expenseService.listCategories(actor),
          (await getEmployeeService()).list(actor, today),
          costService.listQuoteOptions(actor),
          expenseService.listSuppliers(actor),
        ]);
        return {
          cost,
          options: {
            categories,
            employees: employees.map(({ id: employeeId, name, active: isActive }) => ({ id: employeeId, name, active: isActive })),
            quotes: quoteOptions,
            suppliers: suppliers.map(({ id: supplierId, name }) => ({ id: supplierId, name })),
          },
        };
      })()
    : null;
  const dates = [
    `Criado em ${formatTimestamp(quote.created_at, profile.timezone)}`,
    quote.sent_at ? `enviado em ${formatTimestamp(quote.sent_at, profile.timezone)}` : null,
    quote.approved_at ? `aprovado em ${formatTimestamp(quote.approved_at, profile.timezone)}` : null,
    quote.refused_at ? `recusado em ${formatTimestamp(quote.refused_at, profile.timezone)}` : null,
    quote.closed_at ? `fechado em ${formatTimestamp(quote.closed_at, profile.timezone)}` : null,
  ].filter(Boolean);
  const viewText = quoteViewText(quote.status, view, profile.timezone);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Link href="/dashboard/quotes" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-4" /> Orçamentos
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-heading text-2xl font-extrabold tracking-tight">Orçamento Nº {formatQuoteNumber(quote.number)}</h1>
          <Badge variant={QUOTE_STATUS_VARIANT[quote.status]}>{QUOTE_STATUS_LABEL[quote.status]}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">{dates.join(" · ")}</p>
        {viewText ? (
          <p className={`flex items-center gap-1.5 text-sm ${view ? "text-foreground" : "text-muted-foreground"}`}>
            {view ? <Eye className="size-4 shrink-0 text-info" aria-hidden /> : <EyeOff className="size-4 shrink-0" aria-hidden />}
            {viewText}
          </p>
        ) : null}
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
              {signatureUrls.get(response.id) ? (
                <Image
                  src={signatureUrls.get(response.id)!}
                  alt={`Assinatura de ${response.name}`}
                  width={400}
                  height={150}
                  unoptimized
                  className="mt-2 w-full max-w-sm rounded-lg border bg-white"
                />
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>
      {visits.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Visitas deste orçamento</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col divide-y">
            {visits.map((visit) => (
              <VisitRow key={visit.id} visit={visit} showDate showClient={false} />
            ))}
          </CardContent>
        </Card>
      ) : null}
      {receivables ? (
        <Card>
          <CardHeader>
            <CardTitle>Recebimentos</CardTitle>
            <p className="text-sm text-muted-foreground">
              Recebido {formatCents(receivables.reduce((sum, item) => sum + (item.received_cents ?? 0), 0))} de {formatCents(revenue?.amount_cents ?? quote.total_cents)}
            </p>
          </CardHeader>
          <CardContent>
            <ReceivableList
              items={receivables}
              today={today}
              showQuote={false}
              empty="Nenhuma parcela registrada."
              companyName={active.name}
              reminderPhone={isDemo ? brand.salesWhatsapp : undefined}
            />
          </CardContent>
        </Card>
      ) : null}
      {costs ? (
        <ServiceCostSection
          quoteId={quote.id}
          cost={costs.cost}
          targetMarginPercent={targetMarginPercent}
          expenseOptions={costs.options}
          today={today}
          pdf={{
            companyName: active.name,
            quoteNumber: formatQuoteNumber(quote.number),
            title: quote.title,
            clientName: clientDetail?.client.name ?? null,
            statusLabel: QUOTE_STATUS_LABEL[quote.status],
            targetMarginPercent,
            cost: costs.cost,
          }}
        />
      ) : null}
      <QuoteEditor
        key={quote.updated_at}
        canSeeCost={permissionService.canManageFinance(active.role)}
        taxRateBps={quote.tax_rate_bps ?? companyTaxRateBps}
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
              approval: approvalResponse
                ? {
                    name: approvalResponse.name,
                    comment: approvalResponse.comment,
                    approvedAt: approvalResponse.created_at,
                    signatureUrl: signatureUrls.get(approvalResponse.id) ?? null,
                  }
                : null,
            })}
            contact={primaryContact ? { name: primaryContact.name, phone: isDemo ? brand.salesWhatsapp : primaryContact.phone } : null}
            publicUrl={allowsPublicLink ? getPublicQuoteUrl(quote.public_token) : null}
            revenue={revenue}
            canClose={permissionService.canCloseQuotes(active.role)}
            canDelete={permissionService.canDeleteRecords(active.role)}
            today={today}
            cardFees={cardFeesOf(profile)}
          />
        }
      />
    </div>
  );
}
