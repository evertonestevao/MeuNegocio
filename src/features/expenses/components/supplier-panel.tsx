import Link from "next/link";
import { Store } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { CategorySuppliers, SupplierStats } from "@/services/expenseService";
import { DeleteSupplierButton, SupplierFormButton } from "./expense-forms";

const PERIODS = [
  { value: "3m", label: "3 meses" },
  { value: "12m", label: "12 meses" },
  { value: "all", label: "Tudo" },
] as const;

/** Fornecedores: quanto se gastou com cada um e de quem mais se compra cada categoria. */
export function SupplierPanel({
  stats,
  byCategory,
  period,
  periodHref,
}: {
  stats: SupplierStats[];
  byCategory: CategorySuppliers[];
  period: "3m" | "12m" | "all";
  periodHref: (value: string) => string;
}) {
  if (stats.length === 0) {
    return (
      <EmptyState
        icon={Store}
        title="Nenhum fornecedor ainda"
        description="Cadastre aqui ou digite o nome ao lançar um gasto: o fornecedor é criado na hora."
      />
    );
  }
  const top = stats[0]?.totalCents ?? 0;
  const total = stats.reduce((sum, item) => sum + item.totalCents, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <nav className="flex gap-2" aria-label="Período">
          {PERIODS.map((item) => (
            <Link
              key={item.value}
              scroll={false}
              href={periodHref(item.value)}
              className={cn(
                "whitespace-nowrap rounded-full px-3.5 py-2 text-sm lg:py-1.5",
                period === item.value ? "bg-primary font-medium text-primary-foreground" : "border bg-card hover:bg-muted",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <span className="text-sm text-muted-foreground">
          Comprado no período: <strong className="text-foreground tabular-nums">{formatCents(total)}</strong>
        </span>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card className="py-0">
          <CardHeader className="pt-4">
            <CardTitle>Quanto foi para cada fornecedor</CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            <ul className="flex flex-col divide-y">
              {stats.map((item) => (
                <li key={item.supplier.id} className="flex flex-col gap-1.5 px-4 py-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <span className="flex min-w-0 flex-col">
                      <span className="font-medium break-words">{item.supplier.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {[
                          item.purchases === 0 ? "Sem compras no período" : item.purchases === 1 ? "1 compra" : `${item.purchases} compras`,
                          item.lastPurchase ? `última em ${formatDate(item.lastPurchase)}` : null,
                          item.topCategories.join(", ") || null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1">
                      <span className="mr-1 font-semibold tabular-nums">{formatCents(item.totalCents)}</span>
                      <SupplierFormButton supplier={item.supplier} />
                      <DeleteSupplierButton supplier={item.supplier} />
                    </span>
                  </div>
                  <span className="h-2 overflow-hidden rounded-full bg-muted">
                    <span className="block h-full rounded-full bg-chart-2" style={{ width: `${top ? Math.round((item.totalCents / top) * 100) : 0}%` }} />
                  </span>
                  {item.supplier.phone || item.supplier.document ? (
                    <span className="text-xs text-muted-foreground">{[item.supplier.document, item.supplier.phone].filter(Boolean).join(" · ")}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>De quem mais compramos</CardTitle>
            <CardDescription>Em cada categoria, os fornecedores que mais receberam no período.</CardDescription>
          </CardHeader>
          <CardContent>
            {byCategory.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum gasto com fornecedor no período.</p>
            ) : (
              <ul className="flex flex-col gap-4 text-sm">
                {byCategory.map((category) => (
                  <li key={category.categoryId} className="flex flex-col gap-1.5">
                    <div className="flex justify-between gap-3">
                      <span className="font-medium">{category.name}</span>
                      <span className="tabular-nums text-muted-foreground">{formatCents(category.totalCents)}</span>
                    </div>
                    <ol className="flex flex-col gap-1">
                      {category.suppliers.map((entry, index) => (
                        <li key={entry.supplierId} className="flex items-center justify-between gap-3">
                          <span className="flex min-w-0 items-center gap-2">
                            <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold", index === 0 ? "bg-sidebar-primary text-sidebar-primary-foreground" : "bg-muted text-muted-foreground")}>
                              {index + 1}
                            </span>
                            <span className="truncate">{entry.name}</span>
                          </span>
                          <span className="shrink-0 tabular-nums">
                            {formatCents(entry.totalCents)} <span className="text-xs text-muted-foreground">· {entry.sharePercent}%</span>
                          </span>
                        </li>
                      ))}
                    </ol>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
