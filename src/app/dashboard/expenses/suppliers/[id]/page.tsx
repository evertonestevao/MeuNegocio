import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { SupplierDetail } from "@/features/expenses/components/supplier-detail";
import { parseSupplierPurchaseFilters } from "@/features/expenses/schemas";
import { AppError } from "@/lib/errors";
import { getExpenseService } from "@/server/finance";
import { getActiveTenant } from "@/server/tenant";
import { permissionService } from "@/services/permissionService";

export const metadata: Metadata = { title: "Fornecedor" };

export default async function SupplierDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string; min?: string; max?: string; sort?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { active } = await getActiveTenant();
  if (!active) return null;
  if (!permissionService.canManageFinance(active.role)) redirect("/dashboard");
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const filters = parseSupplierPurchaseFilters(sp);
  const service = await getExpenseService();
  const detail = await service.supplierDetail({ companyId: active.id, role: active.role }, id, filters).catch((error: unknown) => {
    if (error instanceof AppError && error.code === "not_found") notFound();
    throw error;
  });

  return (
    <SupplierDetail
      basePath={`/dashboard/expenses/suppliers/${id}`}
      supplier={detail.supplier}
      summary={detail.summary}
      purchases={detail.purchases}
      totalCount={detail.totalCount}
      filters={filters}
    />
  );
}
