import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BookOpen } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  DeleteCatalogItemButton,
  EditCatalogItemButton,
  NewCatalogItemButton,
} from "@/features/catalog/components/catalog-forms";
import { formatCents } from "@/lib/money";
import { marginPercent } from "@/lib/quoteCalc";
import { getCatalogService } from "@/server/quotes";
import { getActiveTenant } from "@/server/tenant";
import { permissionService } from "@/services/permissionService";
import type { CatalogKind } from "@/types/database";

export const metadata: Metadata = { title: "Catálogo" };

export default async function CatalogPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const { kind: rawKind } = await searchParams;
  const { active } = await getActiveTenant();
  if (!active) return null;
  if (!permissionService.canManageQuotes(active.role)) redirect("/dashboard");

  const kind: CatalogKind = rawKind === "service" ? "service" : "product";
  const canEdit = permissionService.canManageCatalog(active.role);
  const service = await getCatalogService();
  const all = await service.list({ companyId: active.id, role: active.role });
  const items = all.filter((item) => item.kind === kind);
  const countOf = (value: CatalogKind) => all.filter((item) => item.kind === value).length;
  const tabs: { value: CatalogKind; label: string }[] = [
    { value: "product", label: "Produtos" },
    { value: "service", label: "Serviços" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Catálogo</h2>
          <p className="text-sm text-muted-foreground">
            Materiais que você vende e serviços que você presta, com os preços usados nos orçamentos.
          </p>
        </div>
        {canEdit ? <NewCatalogItemButton kind={kind} /> : null}
      </div>

      <nav className="flex gap-2" aria-label="Tipo de item">
        {tabs.map((tab) => (
          <Link
            key={tab.value}
            href={`/dashboard/catalog?kind=${tab.value}`}
            aria-current={tab.value === kind ? "page" : undefined}
            className={
              tab.value === kind
                ? "rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
                : "rounded-lg border px-3 py-1.5 text-sm hover:bg-muted"
            }
          >
            {tab.label} ({countOf(tab.value)})
          </Link>
        ))}
      </nav>

      {items.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title={kind === "product" ? "Nenhum produto ainda" : "Nenhum serviço ainda"}
          description="Cadastre para usar nos orçamentos."
        />
      ) : (
        <Card className="py-0">
          <CardContent className="px-0">
            <ul className="flex flex-col divide-y">
              {items.map((item) => {
                const margin = item.cost_cents ? marginPercent(item.price_cents, item.cost_cents) : null;
                return (
                  <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-sm">
                      <span className="flex flex-wrap items-center gap-2 font-medium">
                        {item.name}
                        {item.active ? null : <Badge variant="secondary">Inativo</Badge>}
                      </span>
                      <span className="text-muted-foreground">
                        {[item.description, margin !== null ? `margem ${margin}%` : null].filter(Boolean).join(" · ") || " "}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right text-sm">
                        <div className="font-medium tabular-nums">{formatCents(item.price_cents)}</div>
                        <div className="text-xs text-muted-foreground">por {item.unit}</div>
                      </div>
                      {canEdit ? (
                        <div className="flex">
                          <EditCatalogItemButton item={item} />
                          <DeleteCatalogItemButton item={item} />
                        </div>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
