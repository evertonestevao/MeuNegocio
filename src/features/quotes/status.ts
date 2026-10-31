import type { QuoteStatus } from "@/types/database";

export const QUOTE_STATUS_LABEL: Record<QuoteStatus, string> = {
  draft: "Rascunho",
  sent: "Enviado",
  approved: "Aprovado",
  refused: "Recusado",
  expired: "Expirado",
  closed: "Fechado",
};

export const QUOTE_STATUSES = Object.keys(QUOTE_STATUS_LABEL) as QuoteStatus[];

export function formatQuoteNumber(number: number): string {
  return String(number).padStart(4, "0");
}
