import { z } from "zod";
import { parseMoneyToCents } from "@/lib/money";

/** Validação do catálogo: roda no navegador e de novo no servidor. */

export const CATALOG_UNITS = ["un", "m", "m²", "m³", "barra", "kg", "l", "cx", "h", "visita", "serviço", "diária"] as const;

const money = z.string().transform((value, context) => {
  const cents = parseMoneyToCents(value === "" ? "0" : value);
  if (cents === null) {
    context.addIssue({ code: "custom", message: "Informe um valor válido, como 149,90." });
    return z.NEVER;
  }
  return cents;
});

export const catalogItemSchema = z
  .object({
    kind: z.enum(["product", "service"]),
    name: z.string().trim().min(2, "Informe o nome.").max(160, "Use até 160 caracteres."),
    description: z.string().trim().max(500, "Use até 500 caracteres.").transform((value) => value || null),
    unit: z.enum(CATALOG_UNITS, { error: "Escolha a unidade." }),
    pricingMode: z.enum(["fixed", "hourly"]),
    priceCents: money,
    costCents: money,
    active: z.boolean(),
  })
  .transform((item) => (item.pricingMode === "hourly" ? { ...item, unit: "h" as const } : item));

export type CatalogItemInput = z.output<typeof catalogItemSchema>;

export function parseCatalogForm(formData: FormData): CatalogItemInput {
  const kind = String(formData.get("kind") ?? "");
  return catalogItemSchema.parse({
    kind,
    name: formData.get("name") ?? "",
    description: formData.get("description") ?? "",
    unit: formData.get("unit") ?? "",
    pricingMode: kind === "service" ? (formData.get("pricingMode") ?? "fixed") : "fixed",
    priceCents: formData.get("price") ?? "",
    costCents: formData.get("cost") ?? "",
    active: formData.get("active") === "on",
  });
}
