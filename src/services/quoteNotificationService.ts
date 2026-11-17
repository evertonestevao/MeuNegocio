import type { EmailMessage, EmailProvider } from "@/adapters/email/EmailProvider";
import { formatQuoteNumber } from "@/features/quotes/status";
import { emailParagraph, renderEmailLayout } from "@/lib/emailLayout";
import { escapeHtml } from "@/lib/html";
import { formatCents } from "@/lib/money";

/**
 * Avisa a empresa quando o cliente responde o orçamento pelo link. Vai para o proprietário e os
 * administradores, que são quem fecha o orçamento. Enviar é melhor-esforço: quem chama não deixa
 * uma falha de e-mail desfazer a resposta do cliente.
 */

export interface QuoteResponseSummary {
  companyName: string;
  quoteNumber: number;
  quoteTitle: string | null;
  clientName: string | null;
  totalCents: number;
}

export interface QuoteNotificationReaders {
  getQuoteSummary(companyId: string, quoteId: string): Promise<QuoteResponseSummary | null>;
  /** E-mails do proprietário e dos administradores ativos da empresa. */
  listManagerEmails(companyId: string): Promise<string[]>;
}

export interface QuoteResponse {
  companyId: string;
  quoteId: string;
  decision: "approved" | "refused";
  name: string;
  comment: string;
}

/** Conteúdo do aviso: assunto direto, o que o cliente escreveu e o link para o orçamento. */
export function quoteResponseEmail(summary: QuoteResponseSummary, response: QuoteResponse, quoteUrl: string, appUrl: string): Omit<EmailMessage, "to"> {
  const approved = response.decision === "approved";
  const number = formatQuoteNumber(summary.quoteNumber);
  const who = summary.clientName ?? response.name;
  const subject = `${who} ${approved ? "aprovou" : "recusou"} o orçamento Nº ${number}`;
  const service = summary.quoteTitle ? ` (${summary.quoteTitle})` : "";
  const total = formatCents(summary.totalCents);
  const comment = response.comment.trim();
  const next = approved ? "Próximo passo: agende a execução e, ao concluir, feche e fature." : "Veja o motivo e, se fizer sentido, duplique o orçamento com os ajustes.";

  const text = [
    `${response.name} ${approved ? "aprovou e assinou" : "recusou"} o orçamento Nº ${number}${service}, de ${total}, pelo link.`,
    comment ? `${approved ? "Observação" : "Motivo"}: ${comment}` : null,
    next,
    `Abrir o orçamento: ${quoteUrl}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const html = renderEmailLayout({
    appUrl,
    title: `${approved ? "Orçamento aprovado" : "Orçamento recusado"}: Nº ${number}`,
    preheader: subject,
    bodyHtml: [
      emailParagraph(`<strong>${escapeHtml(response.name)}</strong> ${approved ? "aprovou e assinou" : "recusou"} o orçamento Nº ${number}${escapeHtml(service)}, de <strong>${total}</strong>, pelo link.`),
      comment ? emailParagraph(`${approved ? "Observação" : "Motivo"}: ${escapeHtml(comment)}`) : "",
      emailParagraph(next),
    ]
      .filter(Boolean)
      .join("\n"),
    button: { label: "Abrir o orçamento", url: quoteUrl },
    footnote: `Aviso automático do ${summary.companyName} no sistema.`,
  });

  return { subject, text, html };
}

export function createQuoteNotificationService({ readers, provider, appUrl }: { readers: QuoteNotificationReaders; provider: EmailProvider; appUrl: string }) {
  const base = appUrl.replace(/\/+$/, "");
  return {
    /** Devolve quantos avisos saíram. Sem destinatário ou sem o orçamento, não envia nada. */
    async notifyResponse(response: QuoteResponse): Promise<number> {
      const [summary, recipients] = await Promise.all([
        readers.getQuoteSummary(response.companyId, response.quoteId),
        readers.listManagerEmails(response.companyId),
      ]);
      if (!summary || recipients.length === 0) return 0;
      const message = quoteResponseEmail(summary, response, `${base}/dashboard/quotes/${response.quoteId}`, base);
      // Um e-mail por pessoa: ninguém vê o endereço dos outros.
      const results = await Promise.allSettled([...new Set(recipients)].map((to) => provider.send({ to, ...message })));
      const failed = results.filter((result) => result.status === "rejected");
      if (failed.length === results.length) throw (failed[0] as PromiseRejectedResult).reason;
      return results.length - failed.length;
    },
  };
}

export type QuoteNotificationService = ReturnType<typeof createQuoteNotificationService>;
