import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Wrench } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { ServiceListItemCard } from "@/features/service-costs/components/service-list-item";
import { todayInTimezone } from "@/lib/dates";
import { getExpenseService } from "@/server/finance";
import { getCompanyProfileService } from "@/server/quotes";
import { getEmployeeService } from "@/server/schedule";
import { getServiceCostService } from "@/server/serviceCosts";
import { getActiveTenant } from "@/server/tenant";
import { permissionService } from "@/services/permissionService";

export const metadata: Metadata = { title: "Serviços" };

export default async function ServicesPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  const { active } = await getActiveTenant();
  if (!active) return null;
  if (!permissionService.canManageSchedule(active.role)) redirect("/dashboard");

  const stage = tab === "concluidos" ? "done" : "open";
  const actor = { companyId: active.id, role: active.role };
  const profile = await (await getCompanyProfileService()).get(active.id);
  const today = todayInTimezone(profile.timezone);
  const target = profile.target_margin_percent ?? 20;
  const seesMoney = permissionService.canManageFinance(active.role);
  const service = await getServiceCostService();

  const [open, done, expenseOptions] = await Promise.all([
    service.listServices(actor, "open", today, target),
    stage === "done" ? service.listServices(actor, "done", today, target) : Promise.resolve(null),
    seesMoney
      ? Promise.all([
          (await getExpenseService()).listCategories(actor),
          (await getEmployeeService()).list(actor, today),
          service.listQuoteOptions(actor),
          (await getExpenseService()).listSuppliers(actor),
        ]).then(
          ([categories, employees, quotes, suppliers]) => ({
            categories,
            employees: employees.map(({ id, name, active: isActive }) => ({ id, name, active: isActive })),
            quotes,
            suppliers: suppliers.map(({ id, name }) => ({ id, name })),
          }),
        )
      : Promise.resolve(null),
  ]);
  const items = stage === "done" ? (done ?? []) : open;
  const alerts = open.filter((item) => item.alert).length;
  const chip = (on: boolean) =>
    `whitespace-nowrap rounded-full px-3.5 py-2 text-sm lg:py-1.5 ${on ? "bg-primary font-medium text-primary-foreground" : "border bg-card hover:bg-muted"}`;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="font-heading text-2xl font-extrabold tracking-tight">Serviços</h2>
        <p className="text-sm text-muted-foreground">
          {seesMoney
            ? "Orçamentos aprovados em execução: acompanhe as visitas, lance os gastos e conclua para faturar."
            : "Orçamentos aprovados em execução e o andamento das visitas."}
        </p>
      </div>

      <nav className="flex flex-wrap gap-2" aria-label="Situação dos serviços">
        <Link scroll={false} href="/dashboard/services" className={chip(stage === "open")}>
          Em andamento <span className="ml-1 text-xs opacity-70">{open.length}</span>
        </Link>
        <Link scroll={false} href="/dashboard/services?tab=concluidos" className={chip(stage === "done")}>
          Concluídos
        </Link>
      </nav>

      {stage === "open" && alerts > 0 ? (
        <p className="rounded-lg bg-warning/10 px-3 py-2 text-sm">
          {alerts === 1 ? "1 serviço pede atenção" : `${alerts} serviços pedem atenção`}: custo acima do previsto ou margem abaixo da meta de {target}%.
        </p>
      ) : null}

      {items.length === 0 ? (
        <EmptyState
          icon={Wrench}
          title={stage === "open" ? "Nenhum serviço em andamento" : "Nenhum serviço concluído ainda"}
          description={stage === "open" ? "Quando o cliente aprovar um orçamento, ele aparece aqui para você acompanhar." : "Os serviços concluídos e faturados aparecem aqui."}
        />
      ) : (
        <div className="grid items-start gap-3 lg:grid-cols-2">
          {items.map((item) => (
            <ServiceListItemCard
              key={item.quote.id}
              item={item}
              stage={stage}
              today={today}
              canClose={permissionService.canCloseQuotes(active.role)}
              expenseOptions={expenseOptions}
            />
          ))}
        </div>
      )}
    </div>
  );
}
