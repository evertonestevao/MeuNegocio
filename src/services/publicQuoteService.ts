import { MAX_IMAGE_BYTES, detectImageType } from "@/features/work-orders/schemas";
import { AppError } from "@/lib/errors";
import type { PublicQuoteRepository } from "./quoteService";

/**
 * Resposta do cliente pelo link de aprovação, sem login. Aprovar exige assinatura, que fica em
 * bucket privado na pasta do orçamento. Quem chama já validou o formulário e o limite por IP.
 */

export interface QuoteSignatureFiles {
  upload(path: string, content: Uint8Array, contentType: string): Promise<void>;
  remove(path: string): Promise<void>;
}

interface PublicQuoteServiceDeps {
  repo: PublicQuoteRepository;
  files: QuoteSignatureFiles;
  /** O plano da empresa inclui o link de aprovação? */
  canUsePublicApproval(companyId: string): Promise<boolean>;
  newId(): string;
}

export interface PublicResponseInput {
  decision: "approved" | "refused";
  name: string;
  comment: string;
  /** PNG do quadro de assinatura; ignorado na recusa. */
  signature: Uint8Array | null;
}

export function createPublicQuoteService({ repo, files, canUsePublicApproval, newId }: PublicQuoteServiceDeps) {
  return {
    async respond(token: string, input: PublicResponseInput) {
      const quote = await repo.getByToken(token);
      if (!quote || !(await canUsePublicApproval(quote.companyId))) {
        throw new AppError("not_found", "Orçamento não encontrado");
      }

      let signaturePath: string | null = null;
      if (input.decision === "approved") {
        const bytes = input.signature;
        if (!bytes || bytes.length === 0) throw new AppError("validation_error", "Assine para aprovar o orçamento.");
        if (bytes.length > MAX_IMAGE_BYTES || detectImageType(bytes) !== "image/png") {
          throw new AppError("validation_error", "Não foi possível ler a assinatura. Limpe e assine de novo.");
        }
        signaturePath = `${quote.companyId}/${quote.quoteId}/${newId()}.png`;
        await files.upload(signaturePath, bytes, "image/png");
      }

      try {
        return await repo.respond(token, input.decision, input.name, input.comment, signaturePath);
      } catch (err) {
        // Sem a resposta gravada, a assinatura não serve para nada.
        if (signaturePath) await files.remove(signaturePath).catch(() => undefined);
        throw err;
      }
    },
  };
}

export type PublicQuoteService = ReturnType<typeof createPublicQuoteService>;
