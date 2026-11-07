import type { QuoteStatus, QuoteView } from "@/types/database";

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

function dayAndTime(timestamp: string, timezone: string): { day: string; shortDay: string; time: string } {
  const date = new Date(timestamp);
  return {
    day: date.toLocaleDateString("pt-BR", { timeZone: timezone }),
    shortDay: date.toLocaleDateString("pt-BR", { timeZone: timezone, day: "2-digit", month: "2-digit" }),
    time: date.toLocaleTimeString("pt-BR", { timeZone: timezone, hour: "2-digit", minute: "2-digit" }),
  };
}

/**
 * O que a página do orçamento diz sobre o link: "Visto pelo cliente em 07/11/2026 às 14:32" e, se
 * abriu de novo, quantas vezes e quando foi a última. Enviado e nunca aberto também é informação.
 */
export function quoteViewText(status: QuoteStatus, view: QuoteView | null, timezone: string): string | null {
  if (status === "draft") return null;
  if (!view) return status === "sent" ? "O cliente ainda não abriu o link." : null;
  const first = dayAndTime(view.first_viewed_at, timezone);
  const text = `Visto pelo cliente em ${first.day} às ${first.time}`;
  if (view.view_count <= 1) return `${text}.`;
  const last = dayAndTime(view.last_viewed_at, timezone);
  return `${text}. Abriu ${view.view_count} vezes, a última em ${last.day} às ${last.time}.`;
}

/** Na lista, só para quem espera resposta: "Visto em 07/11" ou "Não aberto". */
export function quoteViewTag(status: QuoteStatus, view: QuoteView | null, timezone: string): { label: string; seen: boolean } | null {
  if (status !== "sent") return null;
  return view ? { label: `Visto em ${dayAndTime(view.first_viewed_at, timezone).shortDay}`, seen: true } : { label: "Não aberto", seen: false };
}
