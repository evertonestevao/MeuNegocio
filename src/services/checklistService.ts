import { AppError } from "@/lib/errors";
import type { ActorContext } from "@/server/actor";
import type { VisitKind } from "@/types/database";
import { permissionService } from "./permissionService";

/** Modelos de checklist da empresa, um por tipo de visita. */
export type ChecklistTemplates = Record<VisitKind, string[]>;

export interface ChecklistRepository {
  list(companyId: string): Promise<ChecklistTemplates>;
  save(companyId: string, kind: VisitKind, labels: string[]): Promise<void>;
}

export function createChecklistService(repo: ChecklistRepository) {
  return {
    list: (actor: ActorContext) => repo.list(actor.companyId),

    async save(actor: ActorContext, kind: VisitKind, labels: string[]) {
      if (!permissionService.canEditCompany(actor.role)) {
        throw new AppError("forbidden", "Só o proprietário e o administrador alteram os checklists");
      }
      await repo.save(actor.companyId, kind, labels);
    },
  };
}

export type ChecklistService = ReturnType<typeof createChecklistService>;
