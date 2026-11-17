"use server";

import { reportError } from "@/adapters/errorReporting";
import { getEmailProvider } from "@/adapters/email";
import { brand } from "@/config/brand";
import { ABUSE_REASONS, type AbuseReason } from "@/features/company/declaration";
import { getServerEnv } from "@/config/env";
import { getCompanyTrustService } from "@/server/companyTrust";
import { rejectInDemo } from "@/server/demo/mode";
import { getPublicQuoteRepository } from "@/server/quotes";
import { getRequestEvidence } from "@/server/terms";
import { DEMO_QUOTE_TOKEN } from "@/config/demo";
import { AppError } from "@/lib/errors";
import { emailParagraph, renderEmailLayout } from "@/lib/emailLayout";
import { escapeHtml } from "@/lib/html";
import { toActionError, type ActionState } from "./action-state";

/**
 * Denúncia de uso indevido, sem login. Vinda do link de um orçamento, já leva a empresa e o
 * orçamento; vinda do site, leva o nome que a pessoa informou. O suporte recebe um aviso por e-mail.
 */
export async function reportAbuseAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  try {
    await rejectInDemo();
    const token = String(formData.get("token") ?? "");
    if (DEMO_QUOTE_TOKEN.test(token)) throw new AppError("forbidden", "Na demonstração não é possível enviar denúncia.");
    const quote = /^[0-9a-f]{64}$/.test(token) ? await getPublicQuoteRepository().getByToken(token) : null;
    const input = Object.fromEntries(formData);
    if (quote) input.companyName = quote.document.company.name;

    await getCompanyTrustService().report(input, {
      companyId: quote?.companyId ?? null,
      quoteId: quote?.quoteId ?? null,
      evidence: await getRequestEvidence(),
    });

    // Aviso ao suporte: falhar aqui não pode perder a denúncia, que já está guardada.
    if (typeof input.website !== "string" || input.website === "") {
      const reason = ABUSE_REASONS[String(input.reason) as AbuseReason] ?? String(input.reason);
      const company = String(input.companyName ?? "") || "não informada";
      await getEmailProvider()
        .send({
          to: brand.legal.supportEmail,
          subject: `Denúncia de uso indevido: ${company}`,
          text: `Motivo: ${reason}\nEmpresa: ${company}\nVeja em ${getServerEnv().APP_URL}/admin/denuncias`,
          html: renderEmailLayout({
            appUrl: getServerEnv().APP_URL,
            title: "Nova denúncia de uso indevido",
            preheader: `Denúncia sobre ${company}.`,
            bodyHtml: [
              emailParagraph(`<strong>Motivo:</strong> ${escapeHtml(reason)}`),
              emailParagraph(`<strong>Empresa:</strong> ${escapeHtml(company)}`),
            ].join("\n"),
            button: { label: "Ver as denúncias", url: `${getServerEnv().APP_URL}/admin/denuncias` },
          }),
        })
        .catch((err) => void reportError(err, { source: "action" }));
    }
  } catch (err) {
    return toActionError(err);
  }
  return { success: "Denúncia recebida. Vamos analisar e, se for preciso, falamos com você pelo contato informado." };
}

