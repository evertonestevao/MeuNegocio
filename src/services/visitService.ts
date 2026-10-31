import type { VisitInput } from "@/features/visits/schemas";
import { timesOverlap } from "@/lib/calendar";
import { AppError } from "@/lib/errors";
import type { ActorContext } from "@/server/actor";
import type { QuotePickerOption, VisitBusySlot, VisitKind, VisitListItem } from "@/types/database";
import { permissionService } from "./permissionService";

/**
 * Agenda. O escritório vê e altera tudo; só owner e admin excluem. A sobreposição é barrada no
 * banco; findConflicts serve ao aviso ao vivo no formulário.
 */

export interface VisitRepository {
  list(companyId: string, params: { from?: string; to?: string; clientId?: string; quoteId?: string; kind?: VisitKind }): Promise<VisitListItem[]>;
  listBusySlots(companyId: string, date: string): Promise<VisitBusySlot[]>;
  listQuotePicker(companyId: string): Promise<QuotePickerOption[]>;
  save(companyId: string, visitId: string | null, input: VisitInput): Promise<string>;
  softDelete(companyId: string, visitId: string): Promise<void>;
}

export interface VisitConflict {
  employeeId: string;
  clientName: string;
  startsAt: string;
  endsAt: string;
}

/** Quem da empresa já está ocupado no horário, desconsiderando a própria visita. */
export function findConflicts(
  slots: VisitBusySlot[],
  candidate: { visitId: string | null; startsAt: string; endsAt: string },
): VisitConflict[] {
  if (candidate.endsAt <= candidate.startsAt) return [];
  return slots
    .filter(
      (slot) =>
        slot.visit_id !== candidate.visitId &&
        timesOverlap(candidate.startsAt, candidate.endsAt, slot.starts_at.slice(0, 5), slot.ends_at.slice(0, 5)),
    )
    .map((slot) => ({
      employeeId: slot.employee_id,
      clientName: slot.client_name,
      startsAt: slot.starts_at.slice(0, 5),
      endsAt: slot.ends_at.slice(0, 5),
    }));
}

export function createVisitService(repo: VisitRepository) {
  function requireManage({ role }: ActorContext): void {
    if (!permissionService.canManageSchedule(role)) {
      throw new AppError("forbidden", "Sem permissão para acessar a agenda");
    }
  }

  return {
    async list(actor: ActorContext, params: { from?: string; to?: string; clientId?: string; quoteId?: string; kind?: VisitKind; employeeId?: string }) {
      requireManage(actor);
      const { employeeId, ...filters } = params;
      const visits = await repo.list(actor.companyId, filters);
      return employeeId ? visits.filter((visit) => visit.employees.some((person) => person.id === employeeId)) : visits;
    },

    async listConflicts(actor: ActorContext, candidate: { visitId: string | null; visitDate: string; startsAt: string; endsAt: string }) {
      requireManage(actor);
      return findConflicts(await repo.listBusySlots(actor.companyId, candidate.visitDate), candidate);
    },

    async listQuotePicker(actor: ActorContext) {
      requireManage(actor);
      return repo.listQuotePicker(actor.companyId);
    },

    async save(actor: ActorContext, visitId: string | null, input: VisitInput): Promise<string> {
      requireManage(actor);
      return repo.save(actor.companyId, visitId, input);
    },

    async remove(actor: ActorContext, visitId: string): Promise<void> {
      if (!permissionService.canDeleteRecords(actor.role)) {
        throw new AppError("forbidden", "Só o proprietário e o administrador podem excluir");
      }
      await repo.softDelete(actor.companyId, visitId);
    },
  };
}

export type VisitService = ReturnType<typeof createVisitService>;
