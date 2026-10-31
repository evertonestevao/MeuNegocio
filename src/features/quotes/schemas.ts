import { z } from "zod";

/** Validação do orçamento: roda no navegador e de novo no servidor. */

const uuidOrNull = z.uuid().nullable();
const dateOrNull = z.iso.date().nullable();

export const quoteItemSchema = z.object({
  catalogItemId: uuidOrNull,
  description: z.string().trim().min(1, "Descreva todos os itens.").max(300, "Use até 300 caracteres na descrição."),
  unit: z.string().trim().min(1).max(20),
  pricingMode: z.enum(["fixed", "hourly"]),
  quantity: z.number({ error: "Informe a quantidade dos itens." }).positive("A quantidade precisa ser maior que zero.").max(999999),
  people: z.number().int().min(1, "Informe ao menos 1 pessoa.").max(999),
  unitPriceCents: z.number().int().min(0, "O valor não pode ser negativo."),
});

export const quoteSchema = z.object({
  clientId: uuidOrNull,
  locationId: uuidOrNull,
  title: z.string().trim().max(200, "Use até 200 caracteres no título."),
  validUntil: dateOrNull,
  discountCents: z.number().int().min(0, "O desconto não pode ser negativo."),
  notes: z.string().trim().max(4000, "Use até 4000 caracteres nas observações."),
  items: z.array(quoteItemSchema).max(200, "Use até 200 itens."),
});

export type QuoteInput = z.output<typeof quoteSchema>;
export type QuoteItemInput = z.output<typeof quoteItemSchema>;

export const closeQuoteSchema = z.object({
  amountCents: z.number({ error: "Informe um valor válido." }).int().positive("Informe um valor maior que zero."),
  competenceDate: z.iso.date({ error: "Informe a data de competência." }),
});

export const publicResponseSchema = z
  .object({
    decision: z.enum(["approved", "refused"]),
    name: z.string().trim().min(2, "Informe seu nome.").max(160, "Use até 160 caracteres."),
    comment: z.string().trim().max(1000, "Use até 1000 caracteres."),
  })
  .refine((value) => value.decision === "approved" || value.comment.length > 0, {
    message: "Conte o motivo da recusa.",
  });
