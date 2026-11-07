import { auditActionLabel } from "@/features/audit/labels";
import type { QuoteHistoryEntry } from "@/types/database";

export interface QuoteHistoryLine {
  title: string;
  at: string;
  /** Quem fez: a pessoa do escritório, o cliente pelo link ou o sistema. */
  by: string | null;
  /** Quem pediu a mudança, quando o escritório registrou em nome do cliente. */
  requestedBy: string | null;
  note: string | null;
}

const REQUESTER_LABEL: Record<string, string> = {
  "quote.approve": "Quem autorizou",
  "quote.refuse": "Quem recusou",
  "quote.cancel": "Quem pediu o cancelamento",
  "quote.approved_by_client": "Nome informado no link",
  "quote.refused_by_client": "Nome informado no link",
};

const NOTE_LABEL: Record<string, string> = {
  "quote.cancel": "Motivo",
  "quote.refuse": "Motivo",
  "quote.refused_by_client": "Motivo",
};

/** Uma linha do histórico do orçamento, em português, no fuso da empresa. */
export function quoteHistoryLine(entry: QuoteHistoryEntry, timezone: string): QuoteHistoryLine {
  const date = new Date(entry.created_at);
  const at = `${date.toLocaleDateString("pt-BR", { timeZone: timezone })} às ${date.toLocaleTimeString("pt-BR", { timeZone: timezone, hour: "2-digit", minute: "2-digit" })}`;
  const byClient = entry.action === "quote.approved_by_client" || entry.action === "quote.refused_by_client";
  const by = byClient ? "Pelo cliente, no link" : entry.metadata.automatic ? "Pelo sistema, ao vencer a validade" : entry.user_name ? `Por ${entry.user_name}` : null;
  const requester = entry.metadata.requested_by?.trim();
  const note = entry.metadata.note?.trim();
  return {
    title: auditActionLabel(entry.action),
    at,
    by,
    requestedBy: requester ? `${REQUESTER_LABEL[entry.action] ?? "Quem pediu"}: ${requester}` : null,
    note: note ? `${NOTE_LABEL[entry.action] ?? "Observação"}: ${note}` : null,
  };
}
