import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { WorkOrderSheet } from "@/features/work-orders/components/work-order-sheet";
import { getCompanyProfileService } from "@/server/quotes";
import { getActiveTenant } from "@/server/tenant";
import { getWorkOrderService } from "@/server/workOrders";

export const metadata: Metadata = { title: "Ordem de serviço" };

export default async function WorkOrderPage({ params }: { params: Promise<{ visitId: string }> }) {
  const { visitId } = await params;
  const { active } = await getActiveTenant();
  if (!active) return null;
  if (!/^[0-9a-f-]{36}$/i.test(visitId)) notFound();

  const actor = { companyId: active.id, role: active.role };
  const service = await getWorkOrderService();
  // A função do banco só devolve a visita para o escritório ou para quem está escalado nela.
  const sheet = await service.getSheet(actor, visitId);
  if (!sheet) notFound();

  const [profile, files, planAllows] = await Promise.all([
    (await getCompanyProfileService()).get(active.id),
    service.signFiles(sheet),
    service.canUse(actor),
  ]);
  const nowTime = new Intl.DateTimeFormat("en-GB", {
    timeZone: profile.timezone,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());

  return (
    <div className="flex flex-col gap-4">
      <Link
        href={active.role === "technician" ? "/dashboard/my-visits" : "/dashboard/schedule"}
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" /> {active.role === "technician" ? "Minhas visitas" : "Agenda"}
      </Link>
      <WorkOrderSheet
        key={sheet.work_order?.status ?? "none"}
        sheet={sheet}
        company={{
          name: active.name,
          cnpj: profile.cnpj,
          phone: profile.phone,
          email: profile.email,
          address: profile.address,
        }}
        photoUrls={files.photos}
        signatureUrl={files.signature}
        canStart={sheet.is_mine && (sheet.status === "scheduled" || sheet.status === "in_progress")}
        planAllows={planAllows}
        nowTime={nowTime}
      />
    </div>
  );
}
