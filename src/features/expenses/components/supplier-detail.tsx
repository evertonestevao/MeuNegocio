import Link from "next/link";
import { ArrowLeft, Search, Store } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/dates";
import { centsToMoneyInput, formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { formatQuoteNumber } from "@/features/quotes/status";
import type { SupplierPurchaseFilters } from "@/features/expenses/schemas";
import { PAYMENT_METHOD_LABEL } from "@/features/expenses/schemas";
import type { SupplierPurchaseSummary } from "@/services/expenseService";
import type { Expense, Supplier } from "@/types/finance";
import { SupplierFormButton } from "./expense-forms";

const SORTS = [
  { value: "recent", label: "Mais recentes" },
  { value: "amount", label: "Maior valor" },
] as const;

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="py-0">
      <CardContent className="flex flex-col gap-0.5 px-4 py-3">
        <span className="text-xs text-muted-foreground">{label}</span>
        <strong className="text-lg font-semibold tabular-nums">{value}</strong>
        {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
      </CardContent>
    </Card>
  );
}

/** Ficha de um fornecedor: cadastro, visão geral e histórico de compras com filtro de preço. */
export function SupplierDetail({
  basePath,
  supplier,
  summary,
  purchases,
  totalCount,
  filters,
}: {
  basePath: string;
  supplier: Supplier;
  summary: SupplierPurchaseSummary;
  purchases: Expense[];
  totalCount: number;
  filters: SupplierPurchaseFilters;
}) {
  const hasFilter = Boolean(filters.search) || filters.minCents !== null || filters.maxCents !== null;
  const minInput = filters.minCents !== null ? centsToMoneyInput(filters.minCents) : "";
  const maxInput = filters.maxCents !== null ? centsToMoneyInput(filters.maxCents) : "";

  // Mantém os filtros aplicados ao trocar só a ordenação (as pílulas são links).
  function sortHref(value: string): string {
    const query = new URLSearchParams();
    if (filters.search) query.set("q", filters.search);
    if (minInput) query.set("min", minInput);
    if (maxInput) query.set("max", maxInput);
    if (value !== "recent") query.set("sort", value);
    const text = query.toString();
    return text ? `${basePath}?${text}` : basePath;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/dashboard/expenses?tab=suppliers"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Fornecedores
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-heading text-2xl font-extrabold tracking-tight break-words">{supplier.name}</h1>
            {supplier.document || supplier.phone ? (
              <p className="text-sm text-muted-foreground">{[supplier.document, supplier.phone].filter(Boolean).join(" · ")}</p>
            ) : null}
            {supplier.notes ? <p className="mt-1 text-sm text-muted-foreground break-words">{supplier.notes}</p> : null}
          </div>
          <SupplierFormButton supplier={supplier} />
        </div>
      </div>

      {totalCount === 0 ? (
        <EmptyState
          icon={Store}
          title="Nenhuma compra registrada"
          description="Quando você lançar um gasto com este fornecedor, as compras aparecem aqui."
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Total comprado" value={formatCents(summary.totalCents)} hint={totalCount === 1 ? "1 compra" : `${totalCount} compras`} />
            <Stat label="Ticket médio" value={formatCents(summary.avgCents ?? 0)} />
            <Stat
              label="Faixa de preço"
              value={summary.minCents === summary.maxCents ? formatCents(summary.minCents ?? 0) : `${formatCents(summary.minCents ?? 0)} – ${formatCents(summary.maxCents ?? 0)}`}
              hint="menor e maior compra"
            />
            <Stat label="Última compra" value={summary.lastPurchase ? formatDate(summary.lastPurchase) : "—"} hint={summary.firstPurchase ? `desde ${formatDate(summary.firstPurchase)}` : undefined} />
          </div>

          <div className="flex flex-col gap-3">
            <form method="get" action={basePath} className="flex flex-wrap items-end gap-2" role="search">
              <input type="hidden" name="sort" value={filters.sort} />
              <label className="flex min-w-48 flex-1 flex-col gap-1 text-sm">
                <span className="text-muted-foreground">Buscar na descrição</span>
                <Input name="q" defaultValue={filters.search} placeholder="Ex.: gás, peça, material" aria-label="Buscar na descrição" />
              </label>
              <label className="flex w-28 flex-col gap-1 text-sm">
                <span className="text-muted-foreground">Preço mín.</span>
                <Input name="min" defaultValue={minInput} inputMode="decimal" placeholder="0,00" aria-label="Preço mínimo" />
              </label>
              <label className="flex w-28 flex-col gap-1 text-sm">
                <span className="text-muted-foreground">Preço máx.</span>
                <Input name="max" defaultValue={maxInput} inputMode="decimal" placeholder="0,00" aria-label="Preço máximo" />
              </label>
              <Button type="submit">
                <Search className="size-4" /> Filtrar
              </Button>
              {hasFilter ? (
                <Button variant="outline" render={<Link href={sortHref(filters.sort)} />} nativeButton={false}>
                  Limpar
                </Button>
              ) : null}
            </form>

            <nav className="flex gap-2" aria-label="Ordenar">
              {SORTS.map((item) => (
                <Link
                  key={item.value}
                  href={sortHref(item.value)}
                  className={cn(
                    "whitespace-nowrap rounded-full px-3.5 py-2 text-sm lg:py-1.5",
                    filters.sort === item.value ? "bg-primary font-medium text-primary-foreground" : "border bg-card hover:bg-muted",
                  )}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>

          {purchases.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma compra com esses filtros.</p>
          ) : (
            <Card>
              <CardContent className="flex flex-col gap-3">
                <span className="text-sm text-muted-foreground">
                  {purchases.length === totalCount
                    ? totalCount === 1
                      ? "1 compra"
                      : `${totalCount} compras`
                    : `${purchases.length} de ${totalCount} compras`}
                </span>
                <ul className="flex flex-col divide-y">
                  {purchases.map((expense) => (
                    <li key={expense.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm first:pt-0 last:pb-0">
                      <div className="flex min-w-0 flex-1 basis-52 flex-col gap-0.5">
                        <span className="font-medium break-words">{expense.description}</span>
                        <span className="text-xs text-muted-foreground">
                          {[
                            formatDate(expense.expense_date),
                            expense.category_name,
                            expense.payment_method ? PAYMENT_METHOD_LABEL[expense.payment_method] : null,
                            expense.quote_number ? `Serviço #${formatQuoteNumber(expense.quote_number)}` : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </div>
                      <span className="font-medium tabular-nums">{formatCents(expense.amount_cents)}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
