import { MAX_IMAGE_BYTES, detectImageType } from "@/features/work-orders/schemas";
import { AppError } from "@/lib/errors";
import type { ActorContext } from "@/server/actor";
import type { VisitSheet } from "@/types/workOrders";

/**
 * Ordem de serviço. Quem preenche é quem está escalado na visita; o escritório só lê. As regras
 * de quem e quando ficam nas funções do banco, e aqui ficam o plano e o tratamento dos arquivos.
 */

export interface WorkOrderRepository {
  getSheet(companyId: string, visitId: string): Promise<VisitSheet | null>;
  listMine(companyId: string, from: string, to: string): Promise<VisitSheet[]>;
  start(companyId: string, visitId: string): Promise<void>;
  save(companyId: string, visitId: string, input: { doneIds: string[]; report: string; startedTime: string }): Promise<void>;
  addPhoto(companyId: string, visitId: string, path: string, caption: string): Promise<void>;
  removePhoto(companyId: string, visitId: string, photoId: string): Promise<string>;
  complete(companyId: string, visitId: string, input: { signaturePath: string; signatureName: string; finishedTime: string }): Promise<void>;
}

export interface WorkOrderFiles {
  upload(path: string, content: Uint8Array, contentType: string): Promise<void>;
  remove(path: string): Promise<void>;
  createSignedUrl(path: string): Promise<string>;
}

interface WorkOrderServiceDeps {
  repo: WorkOrderRepository;
  files: WorkOrderFiles;
  /** O plano da empresa inclui ordem de serviço? */
  canUseWorkOrders(companyId: string): Promise<boolean>;
  newId(): string;
}

const EXTENSION = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const;

export function createWorkOrderService({ repo, files, canUseWorkOrders, newId }: WorkOrderServiceDeps) {
  async function requirePlan(actor: ActorContext): Promise<void> {
    if (!(await canUseWorkOrders(actor.companyId))) {
      throw new AppError("forbidden", "A ordem de serviço não está incluída no plano da empresa.");
    }
  }

  async function requireOpenOrder(actor: ActorContext, visitId: string): Promise<string> {
    const sheet = await repo.getSheet(actor.companyId, visitId);
    if (!sheet?.is_mine) throw new AppError("not_found", "Visita não encontrada");
    if (!sheet.work_order) throw new AppError("conflict", "Inicie a ordem de serviço antes de continuar.");
    if (sheet.work_order.status === "completed") {
      throw new AppError("conflict", "A ordem de serviço já foi concluída e assinada.");
    }
    return sheet.work_order.id;
  }

  /** Confere tamanho e tipo real, grava no bucket privado e devolve o caminho. */
  async function storeImage(actor: ActorContext, orderId: string, bytes: Uint8Array): Promise<string> {
    if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) {
      throw new AppError("validation_error", "A imagem precisa ter até 900 KB.");
    }
    const type = detectImageType(bytes);
    if (!type) throw new AppError("validation_error", "Envie uma imagem JPG, PNG ou WebP.");
    const path = `${actor.companyId}/${orderId}/${newId()}.${EXTENSION[type]}`;
    await files.upload(path, bytes, type);
    return path;
  }

  return {
    getSheet: (actor: ActorContext, visitId: string) => repo.getSheet(actor.companyId, visitId),
    listMine: (actor: ActorContext, from: string, to: string) => repo.listMine(actor.companyId, from, to),
    canUse: (actor: ActorContext) => canUseWorkOrders(actor.companyId),

    /** Links temporários das fotos e da assinatura, que ficam em bucket privado. */
    async signFiles(sheet: VisitSheet) {
      const order = sheet.work_order;
      if (!order) return { photos: {}, signature: null };
      const entries = await Promise.all(
        order.photos.map(async (photo) => [photo.id, await files.createSignedUrl(photo.path)] as const),
      );
      return {
        photos: Object.fromEntries(entries) as Record<string, string>,
        signature: order.signature_path ? await files.createSignedUrl(order.signature_path) : null,
      };
    },

    async start(actor: ActorContext, visitId: string) {
      await requirePlan(actor);
      await repo.start(actor.companyId, visitId);
    },

    async save(actor: ActorContext, visitId: string, input: { doneIds: string[]; report: string; startedTime: string }) {
      await repo.save(actor.companyId, visitId, input);
    },

    async addPhoto(actor: ActorContext, visitId: string, bytes: Uint8Array, caption: string) {
      const orderId = await requireOpenOrder(actor, visitId);
      const path = await storeImage(actor, orderId, bytes);
      try {
        await repo.addPhoto(actor.companyId, visitId, path, caption);
      } catch (err) {
        await files.remove(path).catch(() => undefined);
        throw err;
      }
    },

    async removePhoto(actor: ActorContext, visitId: string, photoId: string) {
      const path = await repo.removePhoto(actor.companyId, visitId, photoId);
      // O registro já saiu da OS; arquivo órfão em bucket privado não aparece para ninguém.
      await files.remove(path).catch(() => undefined);
    },

    async complete(
      actor: ActorContext,
      visitId: string,
      input: { signature: Uint8Array; signatureName: string; finishedTime: string },
    ) {
      const orderId = await requireOpenOrder(actor, visitId);
      const signaturePath = await storeImage(actor, orderId, input.signature);
      try {
        await repo.complete(actor.companyId, visitId, {
          signaturePath,
          signatureName: input.signatureName,
          finishedTime: input.finishedTime,
        });
      } catch (err) {
        await files.remove(signaturePath).catch(() => undefined);
        throw err;
      }
    },
  };
}

export type WorkOrderService = ReturnType<typeof createWorkOrderService>;
