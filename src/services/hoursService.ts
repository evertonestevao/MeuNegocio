import type { TimeEntryInput } from "@/features/hours/schemas";
import { AppError } from "@/lib/errors";
import { payCents, workedMinutes } from "@/lib/hoursCalc";
import type { ActorContext } from "@/server/actor";
import type { HoursMonth, HoursPersonSummary } from "@/types/finance";
import { permissionService } from "./permissionService";

/**
 * Horas de campo: gestão e pagamento de prestadores, não ponto eletrônico. Só o proprietário e o administrador, e
 * só em plano com o recurso. As regras de fechamento ficam nas funções do banco.
 */

export interface HoursRepository {
  getMonth(companyId: string, month: string): Promise<HoursMonth>;
  save(companyId: string, entryId: string | null, input: TimeEntryInput): Promise<string>;
  setStatus(companyId: string, entryId: string, status: "pending" | "approved"): Promise<void>;
  remove(companyId: string, entryId: string): Promise<void>;
  setDismissed(companyId: string, visitId: string, employeeId: string, dismissed: boolean): Promise<void>;
  close(companyId: string, employeeId: string, month: string): Promise<string>;
}

interface HoursServiceDeps {
  repo: HoursRepository;
  canUseHours(companyId: string): Promise<boolean>;
}

/**
 * Resumo por pessoa. Conta como em aberto o que será pago ao fechar: apontamentos não pagos e
 * sugestões não retiradas. Inativo só aparece se tiver horas no mês.
 */
export function summarizeHours(month: HoursMonth): HoursPersonSummary[] {
  return month.employees
    .map((employee) => {
      const entries = month.entries.filter((entry) => entry.employee_id === employee.id);
      const suggestions = month.suggestions.filter((suggestion) => suggestion.employee_id === employee.id);
      const openMinutes =
        entries.filter((entry) => entry.status !== "paid").reduce((sum, entry) => sum + workedMinutes(entry), 0) +
        suggestions.filter((suggestion) => !suggestion.dismissed).reduce((sum, suggestion) => sum + workedMinutes(suggestion), 0);
      const paidMinutes = entries.filter((entry) => entry.status === "paid").reduce((sum, entry) => sum + workedMinutes(entry), 0);
      return {
        ...employee,
        entries,
        suggestions,
        openMinutes,
        paidMinutes,
        openPayCents: employee.contract_type === "clt" ? 0 : payCents(openMinutes, employee.hourly_pay_cents),
      };
    })
    .filter((person) => person.active || person.entries.length > 0 || person.suggestions.length > 0)
    .sort(
      (a, b) =>
        Number(b.contract_type !== "clt") - Number(a.contract_type !== "clt") || a.name.localeCompare(b.name, "pt-BR"),
    );
}

export function createHoursService({ repo, canUseHours }: HoursServiceDeps) {
  async function requireAccess(actor: ActorContext): Promise<void> {
    if (!permissionService.canManageFinance(actor.role)) {
      throw new AppError("forbidden", "Só o proprietário e o administrador acessam horas");
    }
    if (!(await canUseHours(actor.companyId))) {
      throw new AppError("forbidden", "As horas não estão incluídas no plano da empresa.");
    }
  }

  return {
    canUse: (actor: ActorContext) => canUseHours(actor.companyId),

    async getMonth(actor: ActorContext, month: string) {
      await requireAccess(actor);
      return summarizeHours(await repo.getMonth(actor.companyId, month));
    },

    async save(actor: ActorContext, entryId: string | null, input: TimeEntryInput) {
      await requireAccess(actor);
      return repo.save(actor.companyId, entryId, input);
    },

    async setStatus(actor: ActorContext, entryId: string, status: "pending" | "approved") {
      await requireAccess(actor);
      await repo.setStatus(actor.companyId, entryId, status);
    },

    async remove(actor: ActorContext, entryId: string) {
      await requireAccess(actor);
      await repo.remove(actor.companyId, entryId);
    },

    async setDismissed(actor: ActorContext, visitId: string, employeeId: string, dismissed: boolean) {
      await requireAccess(actor);
      await repo.setDismissed(actor.companyId, visitId, employeeId, dismissed);
    },

    async close(actor: ActorContext, employeeId: string, month: string) {
      await requireAccess(actor);
      return repo.close(actor.companyId, employeeId, month);
    },
  };
}

export type HoursService = ReturnType<typeof createHoursService>;
