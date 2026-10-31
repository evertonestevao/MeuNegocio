import type { CatalogItemInput } from "@/features/catalog/schemas";
import { AppError } from "@/lib/errors";
import type { ActorContext } from "@/server/actor";
import type { CatalogItem, CatalogKind } from "@/types/database";
import { permissionService } from "./permissionService";

/**
 * Catálogo de produtos e serviços. O escritório vê e usa; owner e admin editam e são os únicos
 * a receber custo. Orçamentos guardam cópia dos valores, então nada aqui altera os existentes.
 */

export interface CatalogRepository {
  list(companyId: string, params: { kind?: CatalogKind; activeOnly?: boolean; withCost: boolean }): Promise<CatalogItem[]>;
  get(companyId: string, itemId: string): Promise<CatalogItem | null>;
  insert(companyId: string, input: CatalogItemInput): Promise<CatalogItem>;
  update(companyId: string, itemId: string, input: CatalogItemInput): Promise<void>;
  softDelete(companyId: string, itemId: string): Promise<void>;
}

export function createCatalogService(repo: CatalogRepository) {
  function requireView({ role }: ActorContext): void {
    if (!permissionService.canManageQuotes(role)) {
      throw new AppError("forbidden", "Sem permissão para acessar o catálogo");
    }
  }

  function requireEdit({ role }: ActorContext): void {
    if (!permissionService.canManageCatalog(role)) {
      throw new AppError("forbidden", "Só o proprietário e o administrador editam o catálogo");
    }
  }

  async function requireItem(actor: ActorContext, itemId: string): Promise<void> {
    if (!(await repo.get(actor.companyId, itemId))) {
      throw new AppError("not_found", "Item não encontrado");
    }
  }

  return {
    async list(actor: ActorContext, params: { kind?: CatalogKind; activeOnly?: boolean } = {}) {
      requireView(actor);
      return repo.list(actor.companyId, { ...params, withCost: permissionService.canManageCatalog(actor.role) });
    },

    async create(actor: ActorContext, input: CatalogItemInput) {
      requireEdit(actor);
      return repo.insert(actor.companyId, input);
    },

    async update(actor: ActorContext, itemId: string, input: CatalogItemInput) {
      requireEdit(actor);
      await requireItem(actor, itemId);
      await repo.update(actor.companyId, itemId, input);
    },

    async remove(actor: ActorContext, itemId: string) {
      requireEdit(actor);
      if (!permissionService.canDeleteRecords(actor.role)) {
        throw new AppError("forbidden", "Só o proprietário e o administrador podem excluir");
      }
      await requireItem(actor, itemId);
      await repo.softDelete(actor.companyId, itemId);
    },
  };
}

export type CatalogService = ReturnType<typeof createCatalogService>;
