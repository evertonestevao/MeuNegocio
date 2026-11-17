import type { EmailProvider } from "@/adapters/email/EmailProvider";
import type { CompanyInvite } from "@/types/database";
import type { InviteNotifier } from "./inviteService";
import { brand } from "@/config/brand";
import { roleLabel } from "@/config/roles";
import { emailParagraph, renderEmailLayout } from "@/lib/emailLayout";

/**
 * Emails transacionais da aplicação. Monta o conteúdo aqui (regra de
 * negócio) e delega o envio ao EmailProvider ativo (adapter).
 * Implementa a porta InviteNotifier consumida pelo inviteService.
 */

interface EmailServiceDeps {
  provider: EmailProvider;
  /** URL pública da aplicação, usada nos links dos emails. */
  appUrl: string;
}

export function createEmailService({ provider, appUrl }: EmailServiceDeps) {
  const base = appUrl.replace(/\/+$/, "");

  const notifier: InviteNotifier = {
    async sendInviteEmail(invite: CompanyInvite): Promise<void> {
      const acceptUrl = `${base}/invites/accept?token=${invite.token}`;
      await provider.send({
        to: invite.email,
        subject: `Você foi convidado para uma empresa no ${brand.name}`,
        text: [
          `Você recebeu um convite para entrar em uma empresa no ${brand.name} (papel: ${roleLabel(invite.role)}).`,
          `Aceite em: ${acceptUrl}`,
          "O convite expira em 7 dias. Se você não esperava este e-mail, ignore-o.",
        ].join("\n\n"),
        html: renderEmailLayout({
          appUrl: base,
          title: "Você foi convidado",
          preheader: `Convite para entrar em uma empresa no ${brand.name}.`,
          bodyHtml: [
            emailParagraph(`Você recebeu um convite para entrar em uma empresa no ${brand.name}.`),
            emailParagraph(`Papel: <strong>${roleLabel(invite.role)}</strong>`),
            emailParagraph("O convite expira em 7 dias."),
          ].join("\n"),
          button: { label: "Aceitar convite", url: acceptUrl },
          footnote: "Se você não esperava este e-mail, ignore-o.",
        }),
      });
    },
  };

  return notifier;
}

export type EmailService = ReturnType<typeof createEmailService>;
