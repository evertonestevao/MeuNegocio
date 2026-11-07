import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Eye, EyeOff, FileText, Plus, Search } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PaginationControls } from "@/components/pagination-controls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { QUOTE_STATUS_VARIANT, QUOTE_STATUSES, QUOTE_STATUS_LABEL, formatQuoteNumber, quoteViewTag } from "@/features/quotes/status";
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
  searchParams: Promise<{ page?: string; status?: string; q?: string }>;
}) {
  const { page, status: rawStatus, q } = await searchParams;
  const search = q?.trim() ?? "";
  const { active } = await getActiveTenant();
  if (!active) return null;
  if (!permissionService.canManageQuotes(active.role)) redirect("/dashboard");

  const status = QUOTE_STATUSES.includes(rawStatus as QuoteStatus) ? (rawStatus as QuoteStatus) : null;
  const service = await getQuoteService();
  const quotes = await service.list({ companyId: active.id, role: active.role }, { page: Number(page) || 1, status, search });
  // Trocar de situação mantém a busca.
  const withSearch = (path: string) => (search ? `${path}${path.includes("?") ? "&" : "?"}q=${encodeURIComponent(search)}` : path);
  const totalCount = Object.values(quotes.counts).reduce((sum, count) => sum + (count ?? 0), 0);
  const filterClass = (selected: boolean) =>
    selected
      ? "shrink-0 whitespace-nowrap rounded-full bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground lg:py-1.5"
      : "shrink-0 whitespace-nowrap rounded-full border bg-card px-3.5 py-2 text-sm hover:bg-muted lg:py-1.5";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3 max-sm:[&>*]:w-full">
        <div>
          <h1 className="font-heading text-2xl font-extrabold tracking-tight">Orçamentos</h1>
          <p className="text-sm text-muted-foreground">Do rascunho ao fechamento. Só orçamentos fechados entram no faturamento.</p>
        </div>
        <Button render={<Link href="/dashboard/quotes/new" />} nativeButton={false}>
          <Plus className="size-4" /> Novo orçamento
        </Button>
      </div>

      <form action="/dashboard/quotes" className="flex max-w-md gap-2" role="search">
        {status ? <input type="hidden" name="status" value={status} /> : null}
        <Input name="q" defaultValue={search} placeholder="Cliente, número ou título" aria-label="Buscar orçamentos" />
        <Button type="submit" variant="outline">
          <Search className="size-4" /> Buscar
        </Button>
      </form>

      {/* No celular, uma faixa que desliza para o lado: oito situações em três linhas empurravam a lista. */}
      <nav className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0" aria-label="Filtrar por situação">
        <Link scroll={false} href={withSearch("/dashboard/quotes")} className={filterClass(status === null)}>
          Todos <span className="ml-1 text-xs opacity-70">{totalCount}</span>
        </Link>
        {QUOTE_STATUSES.map((value) => (
          <Link key={value} scroll={false} href={withSearch(`/dashboard/quotes?status=${value}`)} className={filterClass(status === value)}>
            {QUOTE_STATUS_LABEL[value]} <span className="ml-1 text-xs opacity-70">{quotes.counts[value] ?? 0}</span>
          </Link>
        ))}
      </nav>

      {quotes.items.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={search ? "Nenhum orçamento encontrado" : status ? "Nenhum orçamento nesse filtro" : "Nenhum orçamento ainda"}
          description={search ? "Tente o nome do cliente, o número ou uma palavra do título." : "Monte o primeiro orçamento com produtos e horas de serviço."}
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
                      <ViewTag tag={quoteViewTag(quote.status, quote.view, "America/Sao_Paulo")} />
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
            params={{ status, q: search }}
          />
        </>
      )}
    </div>
  );
}

/** Se o cliente já abriu o link: ajuda a decidir de quem cobrar resposta. */
function ViewTag({ tag }: { tag: { label: string; seen: boolean } | null }) {
  if (!tag) return null;
  const Icon = tag.seen ? Eye : EyeOff;
  return (
    <span className={`flex items-center gap-1 text-xs ${tag.seen ? "text-info" : "text-muted-foreground"}`}>
      <Icon className="size-3.5" aria-hidden />
      {tag.label}
    </span>
  );
}
