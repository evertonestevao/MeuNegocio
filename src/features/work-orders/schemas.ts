import { z } from "zod";

/** Validação da ordem de serviço: roda no navegador e de novo no servidor. */

export const MAX_IMAGE_BYTES = 900 * 1024;

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Informe o horário.");

export const saveWorkOrderSchema = z.object({
  doneIds: z.array(z.string().max(10)).max(100),
  report: z.string().trim().max(5000, "Use até 5000 caracteres no relatório."),
  startedTime: time,
});

export const completeWorkOrderSchema = z
  .object({
    signatureName: z.string().trim().min(2, "Informe o nome de quem assinou.").max(160, "Use até 160 caracteres."),
    startedTime: time,
    finishedTime: time,
  })
  .refine((value) => value.finishedTime > value.startedTime, {
    message: "O horário de término precisa ser depois do início.",
  });

export const checklistLabelSchema = z
  .string()
  .trim()
  .min(1, "Escreva o item do checklist.")
  .max(120, "Use até 120 caracteres em cada item.");

/** Tira as linhas em branco antes de conferir os limites. */
export const checklistLabelsSchema = z
  .array(z.string())
  .transform((labels) => labels.map((label) => label.trim()).filter(Boolean))
  .pipe(z.array(checklistLabelSchema).max(30, "Use até 30 itens no checklist."));

export const photoCaptionSchema = z.string().trim().max(200, "Use até 200 caracteres na legenda.");

export const VISIT_KIND_DOCUMENT_LABEL = { assessment: "Visita técnica", execution: "Execução do serviço" } as const;

/** Confere o tipo real do arquivo pelos primeiros bytes; o nome e o content-type são do cliente. */
export function detectImageType(bytes: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  const header = String.fromCharCode(...bytes.slice(0, 4));
  const format = String.fromCharCode(...bytes.slice(8, 12));
  if (header === "RIFF" && format === "WEBP") return "image/webp";
  return null;
}
