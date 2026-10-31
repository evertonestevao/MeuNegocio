import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { HardHat } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { DeleteEmployeeButton, EditEmployeeButton, NewEmployeeButton } from "@/features/team/components/team-forms";
import { CONTRACT_LABEL } from "@/features/team/schemas";
import { formatDate, todayInTimezone } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { getCompanyProfileService } from "@/server/quotes";
import { getEmployeeService } from "@/server/schedule";
import { getActiveTenant, getTenantService } from "@/server/tenant";
import { permissionService } from "@/services/permissionService";

export const metadata: Metadata = { title: "Equipe" };

export default async function TeamPage() {
  const { active } = await getActiveTenant();
  if (!active) return null;
  if (!permissionService.canViewTeam(active.role)) redirect("/dashboard");

  const canManage = permissionService.canManageTeam(active.role);
  const profile = await (await getCompanyProfileService()).get(active.id);
  const employees = await (await getEmployeeService()).list(
    { companyId: active.id, role: active.role },
    todayInTimezone(profile.timezone),
  );
  const users = canManage
    ? (await (await getTenantService()).listMembers(active.id, { page: 1, pageSize: 100 })).items.map((member) => ({
        id: member.user_id,
        name: member.profile?.full_name ?? "Membro",
      }))
    : [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Equipe</h2>
          <p className="text-sm text-muted-foreground">
            Funcionários CLT, prestadores PJ e autônomos que podem ser escalados nas visitas.
          </p>
        </div>
        {canManage ? <NewEmployeeButton users={users} /> : null}
      </div>

      {employees.length === 0 ? (
        <EmptyState
          icon={HardHat}
          title="Ninguém na equipe ainda"
          description="Cadastre as pessoas para escalá-las nas visitas."
        />
      ) : (
        <Card className="py-0">
          <CardContent className="px-0">
            <ul className="flex flex-col divide-y">
              {employees.map((employee) => {
                const details = employee.details;
                const facts = [
                  employee.job_title,
                  details?.phone,
                  details?.hourly_pay_cents ? `${formatCents(details.hourly_pay_cents)}/h pago` : null,
                  details?.legal_name,
                ].filter(Boolean);
                return (
                  <li key={employee.id} className="flex items-start justify-between gap-3 px-4 py-3">
                    <div className="flex min-w-0 flex-col gap-0.5 text-sm">
                      <span className="flex flex-wrap items-center gap-2 font-medium">
                        {employee.name}
                        {details ? <Badge variant="secondary">{CONTRACT_LABEL[details.contract_type]}</Badge> : null}
                        {employee.active ? null : <Badge variant="outline">Inativo</Badge>}
                        {employee.user_id ? <Badge variant="outline">Com login</Badge> : null}
                      </span>
                      {facts.length > 0 ? <span className="text-muted-foreground">{facts.join(" · ")}</span> : null}
                      <span className="text-muted-foreground">
                        {employee.next_visit
                          ? `Próxima visita: ${formatDate(employee.next_visit.visit_date)} às ${employee.next_visit.starts_at.slice(0, 5)} — ${employee.next_visit.client_name}${employee.upcoming_count > 1 ? ` (+${employee.upcoming_count - 1})` : ""}`
                          : "Sem visitas agendadas"}
                      </span>
                    </div>
                    {canManage ? (
                      <div className="flex shrink-0">
                        <EditEmployeeButton employee={employee} users={users} />
                        <DeleteEmployeeButton employee={employee} />
                      </div>
                    ) : null}
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
