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

/** Cor de cada situação: azul em curso, verde deu certo, âmbar pede atenção, vermelho perdeu. */
export const QUOTE_STATUS_VARIANT: Record<QuoteStatus, "secondary" | "info" | "success" | "destructive" | "warning"> = {
  draft: "secondary",
  sent: "info",
  approved: "success",
  refused: "destructive",
  expired: "warning",
  closed: "success",
};
