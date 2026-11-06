import { MAX_LOGO_BYTES } from "@/features/company/logo";
import { detectImageType } from "@/features/work-orders/schemas";
import { AppError } from "@/lib/errors";
import type { ActorContext } from "@/server/actor";
import { permissionService } from "./permissionService";

/**
 * Logo da empresa, no cabeçalho dos documentos que vão para o cliente. Chega sempre em PNG, já
 * reduzido no aparelho; o arquivo fica em bucket público, gravado só pelo servidor.
 */

export interface CompanyLogoRepository {
  getLogoPath(companyId: string): Promise<string | null>;
  setLogoPath(companyId: string, path: string | null): Promise<void>;
}

export interface CompanyLogoFiles {
  upload(path: string, content: Uint8Array, contentType: string): Promise<void>;
  remove(path: string): Promise<void>;
}

interface Deps {
  repo: CompanyLogoRepository;
  files: CompanyLogoFiles;
  newId(): string;
}

export function createCompanyLogoService({ repo, files, newId }: Deps) {
  function requireEditor(actor: ActorContext) {
    if (!permissionService.canEditCompany(actor.role)) {
      throw new AppError("forbidden", "Só o proprietário e o administrador trocam o logo da empresa");
    }
  }

  /** Apaga o arquivo antigo sem travar quem chamou: sobrando, é só um arquivo sem uso. */
  async function discard(path: string | null) {
    if (path) await files.remove(path).catch(() => undefined);
  }

  return {
    /** Troca o logo. Nome novo a cada envio: o navegador e o PDF nunca mostram o antigo do cache. */
    async upload(actor: ActorContext, bytes: Uint8Array): Promise<string> {
      requireEditor(actor);
      if (bytes.length === 0 || bytes.length > MAX_LOGO_BYTES) {
        throw new AppError("validation_error", "O logo precisa ter até 500 KB.");
      }
      if (detectImageType(bytes) !== "image/png") {
        throw new AppError("validation_error", "Envie o logo em PNG, JPG ou WebP.");
      }
      const previous = await repo.getLogoPath(actor.companyId);
      const path = `${actor.companyId}/${newId()}.png`;
      await files.upload(path, bytes, "image/png");
      try {
        await repo.setLogoPath(actor.companyId, path);
      } catch (err) {
        await discard(path);
        throw err;
      }
      await discard(previous);
      return path;
    },

    async remove(actor: ActorContext): Promise<void> {
      requireEditor(actor);
      const previous = await repo.getLogoPath(actor.companyId);
      if (!previous) return;
      await repo.setLogoPath(actor.companyId, null);
      await discard(previous);
    },
  };
}

export type CompanyLogoService = ReturnType<typeof createCompanyLogoService>;
