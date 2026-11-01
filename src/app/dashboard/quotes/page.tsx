import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { FileText, Plus } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PaginationControls } from "@/components/pagination-controls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { QUOTE_STATUS_VARIANT, QUOTE_STATUSES, QUOTE_STATUS_LABEL, formatQuoteNumber } from "@/features/quotes/status";
import { formatDate, formatTimestamp } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { getQuoteService } from "@/server/quotes";
import { getActiveTenant } from "@/server/tenant";
import { permissionService } from "@/services/permissionService";
import type { QuoteStatus } from "@/types/database";

export const metadata: Metadata = { title: "Orçamentos" };

export default async function QuotesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; status?: string }>;
}) {
  const { page, status: rawStatus } = await searchParams;
  const { active } = await getActiveTenant();
  if (!active) return null;
  if (!permissionService.canManageQuotes(active.role)) redirect("/dashboard");

  const status = QUOTE_STATUSES.includes(rawStatus as QuoteStatus) ? (rawStatus as QuoteStatus) : null;
  const service = await getQuoteService();
  const quotes = await service.list({ companyId: active.id, role: active.role }, { page: Number(page) || 1, status });
  const totalCount = Object.values(quotes.counts).reduce((sum, count) => sum + (count ?? 0), 0);
  const filterClass = (selected: boolean) =>
    selected
      ? "shrink-0 whitespace-nowrap rounded-full bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground lg:py-1.5"
      : "shrink-0 whitespace-nowrap rounded-full border bg-card px-3.5 py-2 text-sm hover:bg-muted lg:py-1.5";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3 max-sm:[&>*]:w-full">
        <div>
          <h2 className="font-heading text-2xl font-extrabold tracking-tight">Orçamentos</h2>
          <p className="text-sm text-muted-foreground">Do rascunho ao fechamento. Só orçamentos fechados entram no faturamento.</p>
        </div>
        <Button render={<Link href="/dashboard/quotes/new" />} nativeButton={false}>
          <Plus className="size-4" /> Novo orçamento
        </Button>
      </div>

      <nav className="flex flex-wrap gap-2" aria-label="Filtrar por situação">
        <Link href="/dashboard/quotes" className={filterClass(status === null)}>
          Todos <span className="ml-1 text-xs opacity-70">{totalCount}</span>
        </Link>
        {QUOTE_STATUSES.map((value) => (
          <Link key={value} href={`/dashboard/quotes?status=${value}`} className={filterClass(status === value)}>
            {QUOTE_STATUS_LABEL[value]} <span className="ml-1 text-xs opacity-70">{quotes.counts[value] ?? 0}</span>
          </Link>
        ))}
      </nav>

      {quotes.items.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={status ? "Nenhum orçamento nesse filtro" : "Nenhum orçamento ainda"}
          description="Monte o primeiro orçamento com produtos e horas de serviço."
        />
      ) : (
        <>
          <Card className="py-0">
            <ul className="flex flex-col divide-y">
              {quotes.items.map((quote) => (
                <li key={quote.id}>
                  <Link
                    href={`/dashboard/quotes/${quote.id}`}
                    className="flex flex-col gap-2 px-4 py-3 hover:bg-muted/50 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-sm">
                      <span className="font-medium break-words">
                        #{formatQuoteNumber(quote.number)} · {quote.title ?? "Sem título"}
                      </span>
                      <span className="text-muted-foreground">{quote.client_name ?? "Sem cliente"}</span>
                      <span className="text-xs text-muted-foreground">
                        {[
                          `criado em ${formatTimestamp(quote.created_at)}`,
                          quote.valid_until ? `válido até ${formatDate(quote.valid_until)}` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <Badge variant={QUOTE_STATUS_VARIANT[quote.status]}>{QUOTE_STATUS_LABEL[quote.status]}</Badge>
                      <span className="text-base font-semibold tabular-nums">{formatCents(quote.total_cents)}</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
          <PaginationControls
            page={quotes.page}
            pageSize={quotes.pageSize}
            total={quotes.total}
            basePath="/dashboard/quotes"
          />
        </>
      )}
    </div>
  );
}
