import { z } from "zod";
import { formatCents } from "@/lib/money";
import { subtotalCents } from "@/lib/quoteCalc";

/** Validação do orçamento: roda no navegador e de novo no servidor. */

const uuidOrNull = z.uuid().nullable();
const PAYMENT_METHODS = ["pix", "cash", "debit", "credit", "boleto", "transfer", "other"] as const;

/** Condições de pagamento combinadas; null é "a combinar". */
export const quotePaymentPlanSchema = z
  .object({
    kind: z.enum(["cash", "entry", "card"]),
    method: z.enum(PAYMENT_METHODS).nullable(),
    entry_cents: z.number({ error: "Informe a entrada." }).int().min(0, "A entrada não pode ser negativa.").max(1_000_000_000),
    entry_method: z.enum(PAYMENT_METHODS).nullable(),
    count: z.number({ error: "Informe em quantas vezes." }).int("Use um número inteiro de parcelas.").min(1, "Use ao menos 1 parcela.").max(60, "Use até 60 parcelas."),
  })
  .nullable();
const dateOrNull = z.iso.date().nullable();

export const quoteItemSchema = z.object({
  catalogItemId: uuidOrNull,
  description: z.string().trim().min(1, "Descreva todos os itens.").max(300, "Use até 300 caracteres na descrição."),
  unit: z.string().trim().min(1).max(20),
  pricingMode: z.enum(["fixed", "hourly"]),
  quantity: z.number({ error: "Informe a quantidade dos itens." }).positive("A quantidade precisa ser maior que zero.").max(999999),
  people: z.number().int().min(1, "Informe ao menos 1 pessoa.").max(999),
  unitPriceCents: z.number().int().min(0, "O valor não pode ser negativo."),
  /** Só você vê: o que o item custa para a empresa. Não vai para o cliente. */
  costCents: z.number().int().min(0, "O custo não pode ser negativo.").max(1_000_000_000).nullable().optional(),
});

export const quoteSchema = z
  .object({
    // Orçamento sem cliente não tem para quem ir: nem o primeiro rascunho é salvo sem ele.
    clientId: uuidOrNull.refine((value) => Boolean(value), "Escolha o cliente."),
    locationId: uuidOrNull,
    title: z.string().trim().max(200, "Use até 200 caracteres no título."),
    validUntil: dateOrNull,
    discountCents: z.number().int().min(0, "O desconto não pode ser negativo."),
    notes: z.string().trim().max(4000, "Use até 4000 caracteres nas observações."),
    items: z.array(quoteItemSchema).max(200, "Use até 200 itens."),
    paymentPlan: quotePaymentPlanSchema.default(null),
  })
  .superRefine((quote, ctx) => {
    // Mesma conta do banco: desconto acima do subtotal zerava o total sem ninguém perceber.
    const subtotal = subtotalCents(quote.items);
    if (quote.discountCents > subtotal) {
      ctx.addIssue({ code: "custom", path: ["discountCents"], message: `O desconto não pode passar do subtotal (${formatCents(subtotal)}).` });
    }
  });

export type QuoteInput = z.output<typeof quoteSchema>;
export type QuoteItemInput = z.output<typeof quoteItemSchema>;

export const installmentSchema = z.object({
  amount_cents: z.number({ error: "Informe o valor de cada parcela." }).int().positive("Cada parcela precisa ter valor maior que zero."),
  due_date: z.iso.date({ error: "Informe o vencimento de cada parcela." }),
  method: z.enum(PAYMENT_METHODS).nullable(),
  received: z.boolean(),
});

export const closeQuoteSchema = z
  .object({
    amountCents: z.number({ error: "Informe um valor válido." }).int().positive("Informe um valor maior que zero."),
    competenceDate: z.iso.date({ error: "Informe a data de competência." }),
    installments: z.array(installmentSchema).min(1, "Informe como o cliente vai pagar.").max(60, "Use até 60 parcelas."),
  })
  .refine((value) => value.installments.reduce((sum, item) => sum + item.amount_cents, 0) === value.amountCents, {
    message: "As parcelas precisam somar o valor fechado.",
    path: ["installments"],
  });

export type CloseQuoteInput = z.output<typeof closeQuoteSchema>;

export const publicResponseSchema = z
  .object({
    decision: z.enum(["approved", "refused"]),
    name: z.string().trim().min(2, "Informe seu nome.").max(160, "Use até 160 caracteres."),
    comment: z.string().trim().max(1000, "Use até 1000 caracteres."),
  })
  .refine((value) => value.decision === "approved" || value.comment.length > 0, {
    message: "Conte o motivo da recusa.",
  });

/** Mudanças que o escritório registra em nome do cliente: dizem quem pediu. */
export const DECISIONS_WITH_REQUESTER = ["approve", "refuse", "cancel"] as const;

/**
 * Mudança de situação pelo escritório. Aprovar, recusar e cancelar pedem o nome de quem pediu
 * (o cliente muitas vezes autoriza por telefone, sem abrir o sistema); cancelar pede o motivo.
 */
export const quoteTransitionSchema = z
  .object({
    action: z.enum(["send", "approve", "refuse", "expire", "reopen", "cancel"]),
    validUntil: z.iso.date("Informe a nova validade.").nullable(),
    requestedBy: z.string().trim().max(160, "Use até 160 caracteres no nome."),
    note: z.string().trim().max(1000, "Use até 1000 caracteres na observação."),
  })
  .superRefine((value, ctx) => {
    if ((DECISIONS_WITH_REQUESTER as readonly string[]).includes(value.action) && value.requestedBy.length < 2) {
      ctx.addIssue({ code: "custom", path: ["requestedBy"], message: "Informe quem pediu a mudança." });
    }
    if (value.action === "cancel" && value.note.length === 0) {
      ctx.addIssue({ code: "custom", path: ["note"], message: "Conte o motivo do cancelamento." });
    }
  });
