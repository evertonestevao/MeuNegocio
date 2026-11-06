import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CalendarDays, HardHat, Phone } from "lucide-react";
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
import { formatPhone } from "@/lib/masks";
import { InitialsAvatar } from "@/components/initials-avatar";

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
      <div className="flex flex-wrap items-center justify-between gap-3 max-sm:[&>*]:w-full">
        <div>
          <h1 className="font-heading text-2xl font-extrabold tracking-tight">Equipe</h1>
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
                  details?.hourly_pay_cents ? `${formatCents(details.hourly_pay_cents)}/h pago` : null,
                  details?.legal_name,
                ].filter(Boolean);
                return (
                  <li key={employee.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-4 py-3 text-sm">
                    <InitialsAvatar name={employee.name} />
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 font-medium">
                      {employee.name}
                      {details ? <Badge variant="info">{CONTRACT_LABEL[details.contract_type]}</Badge> : null}
                      {employee.active ? null : <Badge variant="outline">Inativo</Badge>}
                      {employee.user_id ? <Badge variant="outline">Com acesso</Badge> : null}
                    </span>
                    {canManage ? (
                      <div className="flex shrink-0">
                        <EditEmployeeButton employee={employee} users={users} />
                        <DeleteEmployeeButton employee={employee} />
                      </div>
                    ) : <span />}
                    <div className="col-span-3 flex min-w-0 flex-col gap-1.5 sm:col-span-2 sm:col-start-2">
                      {facts.length > 0 ? <span className="text-muted-foreground">{facts.join(" · ")}</span> : null}
                      {details?.phone ? (
                        <a href={`tel:${details.phone}`} className="flex w-fit items-center gap-1.5 font-medium text-primary">
                          <Phone className="size-3.5" /> {formatPhone(details.phone)}
                        </a>
                      ) : null}
                      <span className="flex items-start gap-1.5 rounded-lg bg-info/10 px-2.5 py-1.5 text-xs">
                        <CalendarDays className="mt-px size-3.5 shrink-0 text-info" />
                        {employee.next_visit
                          ? `Próxima visita: ${formatDate(employee.next_visit.visit_date)} às ${employee.next_visit.starts_at.slice(0, 5)} — ${employee.next_visit.client_name}${employee.upcoming_count > 1 ? ` (+${employee.upcoming_count - 1})` : ""}`
                          : "Sem visitas agendadas"}
                      </span>
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
