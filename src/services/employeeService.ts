import type { EmployeeInput } from "@/features/team/schemas";
import { AppError } from "@/lib/errors";
import type { ActorContext } from "@/server/actor";
import type { Employee, EmployeeListItem, EmployeePaymentDetails } from "@/types/database";
import { permissionService } from "./permissionService";

/**
 * Equipe. O escritório vê nome, função e situação; contrato e pagamento só chegam a owner e
 * admin. Nem toda pessoa tem login: o vínculo com usuário é opcional.
 */

export interface UpcomingVisitRow {
  employee_id: string;
  visit_date: string;
  starts_at: string;
  client_name: string;
}

export interface EmployeeRepository {
  list(companyId: string): Promise<Employee[]>;
  get(companyId: string, employeeId: string): Promise<Employee | null>;
  listDetails(companyId: string): Promise<EmployeePaymentDetails[]>;
  listUpcomingVisits(companyId: string, fromDate: string): Promise<UpcomingVisitRow[]>;
  insert(companyId: string, input: EmployeeInput): Promise<Employee>;
  update(companyId: string, employeeId: string, input: EmployeeInput): Promise<void>;
  softDelete(companyId: string, employeeId: string): Promise<void>;
  /** Quem aparece em visita não é excluído, só desativado. */
  hasHistory(companyId: string, employeeId: string): Promise<boolean>;
}

export function createEmployeeService(repo: EmployeeRepository) {
  function requireView({ role }: ActorContext): void {
    if (!permissionService.canViewTeam(role)) {
      throw new AppError("forbidden", "Sem permissão para acessar a equipe");
    }
  }

  function requireManage({ role }: ActorContext): void {
    if (!permissionService.canManageTeam(role)) {
      throw new AppError("forbidden", "Só owner e admin editam a equipe");
    }
  }

  async function requireEmployee(actor: ActorContext, employeeId: string): Promise<void> {
    if (!(await repo.get(actor.companyId, employeeId))) {
      throw new AppError("not_found", "Pessoa não encontrada");
    }
  }

  return {
    /** Ativos primeiro, cada um com a próxima visita a partir de hoje. */
    async list(actor: ActorContext, today: string): Promise<EmployeeListItem[]> {
      requireView(actor);
      const canSeeDetails = permissionService.canManageTeam(actor.role);
      const [employees, details, upcoming] = await Promise.all([
        repo.list(actor.companyId),
        canSeeDetails ? repo.listDetails(actor.companyId) : Promise.resolve([]),
        repo.listUpcomingVisits(actor.companyId, today),
      ]);
      const detailsById = new Map(details.map((row) => [row.employee_id, row]));
      return employees
        .map((employee) => {
          const visits = upcoming.filter((visit) => visit.employee_id === employee.id);
          return {
            ...employee,
            details: detailsById.get(employee.id) ?? null,
            next_visit: visits[0]
              ? { visit_date: visits[0].visit_date, starts_at: visits[0].starts_at, client_name: visits[0].client_name }
              : null,
            upcoming_count: visits.length,
          };
        })
        .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, "pt-BR"));
    },

    async create(actor: ActorContext, input: EmployeeInput): Promise<Employee> {
      requireManage(actor);
      return repo.insert(actor.companyId, input);
    },

    async update(actor: ActorContext, employeeId: string, input: EmployeeInput): Promise<void> {
      requireManage(actor);
      await requireEmployee(actor, employeeId);
      await repo.update(actor.companyId, employeeId, input);
    },

    async remove(actor: ActorContext, employeeId: string): Promise<void> {
      requireManage(actor);
      await requireEmployee(actor, employeeId);
      if (await repo.hasHistory(actor.companyId, employeeId)) {
        throw new AppError("conflict", "Esta pessoa aparece em visitas e não pode ser excluída. Desative o cadastro.");
      }
      await repo.softDelete(actor.companyId, employeeId);
    },
  };
}

export type EmployeeService = ReturnType<typeof createEmployeeService>;
