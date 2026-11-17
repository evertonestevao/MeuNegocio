import type { EmailMessage } from "@/adapters/email/EmailProvider";
import { brand } from "@/config/brand";
import { emailParagraph, renderEmailLayout } from "@/lib/emailLayout";

/** Conteúdo do e-mail de recuperação de senha: o link já vem montado por quem chama. */
export function passwordRecoveryEmail(link: string, appUrl: string): Omit<EmailMessage, "to"> {
  return {
    subject: `Redefinir sua senha do ${brand.name}`,
    text: [
      `Recebemos um pedido para redefinir a senha da sua conta no ${brand.name}.`,
      `Para criar uma nova senha, abra: ${link}`,
      "O link vale por tempo limitado e só pode ser usado uma vez.",
      "Se você não pediu isso, ignore este e-mail. Sua senha continua a mesma.",
    ].join("\n\n"),
    html: renderEmailLayout({
      appUrl,
      title: "Redefinir sua senha",
      preheader: "Use o link para criar uma nova senha.",
      bodyHtml: [
        emailParagraph(`Recebemos um pedido para redefinir a senha da sua conta no ${brand.name}.`),
        emailParagraph("O link vale por tempo limitado e só pode ser usado uma vez."),
      ].join("\n"),
      button: { label: "Criar nova senha", url: link },
      footnote: "Se você não pediu isso, ignore este e-mail. Sua senha continua a mesma.",
    }),
  };
}
