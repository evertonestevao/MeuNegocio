import { greetingName } from "@/features/quotes/pdf";
import { formatQuoteNumber } from "@/features/quotes/status";
import { formatDate } from "@/lib/dates";
import { receivableStatus } from "@/lib/installments";
import { formatCents } from "@/lib/money";
import type { Receivable } from "@/types/finance";

/** Mensagem de lembrete da parcela, gentil, para o WhatsApp. Sem provedor: abre a conversa pronta. */
export function reminderText(item: Receivable, companyName: string, today: string): string {
  const greeting = item.contact_name ? `Olá, ${greetingName(item.contact_name)}!` : "Olá!";
  const service = `do orçamento Nº ${formatQuoteNumber(item.quote_number)}${item.quote_title ? ` (${item.quote_title})` : ""}`;
  const when =
    receivableStatus(item, today) === "overdue"
      ? `que venceu em ${formatDate(item.due_date)}`
      : item.due_date === today
        ? "que vence hoje"
        : `que vence em ${formatDate(item.due_date)}`;
  return [
    `${greeting} Aqui é da ${companyName}.`,
    `Passando para lembrar da parcela de ${formatCents(item.amount_cents)} ${service}, ${when}.`,
    "Se já pagou, desconsidere esta mensagem. Qualquer dúvida, estou à disposição.",
  ].join("\n");
}
