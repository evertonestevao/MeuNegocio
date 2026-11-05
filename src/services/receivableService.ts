import { z } from "zod";
import { AppError } from "@/lib/errors";
import { parseMoneyToCents } from "@/lib/money";
import type { ActorContext } from "@/server/actor";
import type { PaymentMethod, Receivable } from "@/types/finance";
import { permissionService } from "./permissionService";

/**
 * Contas a receber: as parcelas dos serviços fechados. O faturamento é o que foi vendido; aqui é o
 * dinheiro que entra de fato, em cada parcela. Só owner e admin.
 */

const method = z
  .union([z.enum(["pix", "cash", "debit", "credit", "boleto", "transfer", "other"]), z.literal("")])
  .default("")
  .transform((value) => (value || null) as PaymentMethod | null);

const optionalDate = z
  .union([z.iso.date(), z.literal("")])
  .default("")
  .transform((value) => value || null);

/** Baixa: data, valor (em reais na tela) e forma. Menos que o valor deixa o restante a receber. */
export const receiveInstallmentSchema = z.object({
  id: z.uuid({ error: "Parcela inválida." }),
  receivedOn: z.iso.date({ error: "Informe a data em que recebeu." }),
  receivedCents: z.string().transform((value, context) => {
    const cents = parseMoneyToCents(value);
    if (cents === null || cents <= 0) {
      context.addIssue({ code: "custom", message: "Informe o valor recebido." });
      return z.NEVER;
    }
    return cents;
  }),
  method,
  restDueDate: optionalDate,
});

export const rescheduleInstallmentSchema = z.object({
  id: z.uuid({ error: "Parcela inválida." }),
  dueDate: z.iso.date({ error: "Informe o vencimento." }),
  method,
});

export type ReceiveInstallmentInput = z.output<typeof receiveInstallmentSchema>;
export type RescheduleInstallmentInput = z.output<typeof rescheduleInstallmentSchema>;

export interface ReceivableRepository {
  listOpen(companyId: string): Promise<Receivable[]>;
  listReceived(companyId: string, from: string, to: string): Promise<Receivable[]>;
  listByQuote(companyId: string, quoteId: string): Promise<Receivable[]>;
  receive(companyId: string, input: ReceiveInstallmentInput): Promise<void>;
  undoReceive(companyId: string, id: string): Promise<void>;
  reschedule(companyId: string, input: RescheduleInstallmentInput): Promise<void>;
}

export function createReceivableService(repo: ReceivableRepository) {
  function requireFinance(actor: ActorContext) {
    if (!permissionService.canManageFinance(actor.role)) {
      throw new AppError("forbidden", "Só o proprietário e o administrador cuidam dos recebimentos");
    }
  }

  return {
    async listOpen(actor: ActorContext) {
      requireFinance(actor);
      return repo.listOpen(actor.companyId);
    },

    async listReceived(actor: ActorContext, from: string, to: string) {
      requireFinance(actor);
      return repo.listReceived(actor.companyId, from, to);
    },

    /** O que o cliente ainda deve, parcela a parcela. */
    async listOpenByClient(actor: ActorContext, clientId: string) {
      requireFinance(actor);
      return (await repo.listOpen(actor.companyId)).filter((item) => item.client_id === clientId);
    },

    async listByQuote(actor: ActorContext, quoteId: string) {
      requireFinance(actor);
      return repo.listByQuote(actor.companyId, quoteId);
    },

    async receive(actor: ActorContext, input: ReceiveInstallmentInput, today: string) {
      requireFinance(actor);
      if (input.receivedOn > today) throw new AppError("validation_error", "Informe a data em que recebeu, até hoje.");
      await repo.receive(actor.companyId, input);
    },

    async undoReceive(actor: ActorContext, id: string) {
      requireFinance(actor);
      await repo.undoReceive(actor.companyId, id);
    },

    async reschedule(actor: ActorContext, input: RescheduleInstallmentInput) {
      requireFinance(actor);
      await repo.reschedule(actor.companyId, input);
    },
  };
}

export type ReceivableService = ReturnType<typeof createReceivableService>;
