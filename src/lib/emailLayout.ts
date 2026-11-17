import { brand } from "@/config/brand";
import { escapeHtml } from "./html";

/**
 * Layout único dos e-mails transacionais: faixa escura com o logo, cartão branco com o conteúdo,
 * botão de ação e rodapé. Tudo em tabelas com estilo inline, porque os clientes de e-mail (Gmail,
 * Outlook) ignoram CSS externo e `<style>`. Função pura: quem chama monta o conteúdo.
 */

const COLORS = {
  page: "#f3f4f6",
  header: "#141f2e",
  card: "#ffffff",
  text: "#1b1f27",
  muted: "#6b7280",
  primary: "#0f5bbf",
  onPrimary: "#ffffff",
  line: "#e5e7eb",
} as const;

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export interface EmailLayoutInput {
  /** Endereço público do app: o logo é carregado de `${appUrl}/icons/icon-192.png`. */
  appUrl: string;
  /** Título grande no topo do cartão. */
  title: string;
  /** Texto de prévia que aparece ao lado do assunto na caixa de entrada. */
  preheader?: string;
  /** HTML do corpo. Quem chama escapa o que veio de usuário (use `emailParagraph` e `escapeHtml`). */
  bodyHtml: string;
  /** Botão de ação principal. O endereço também aparece em texto, para quem não consegue clicar. */
  button?: { label: string; url: string };
  /** Nota em letra pequena no fim do cartão (ex.: "Se você não pediu isso, ignore"). */
  footnote?: string;
}

/** Parágrafo no espaçamento do layout. O conteúdo entra como HTML já seguro. */
export function emailParagraph(innerHtml: string): string {
  return `<p style="margin:0 0 16px;font-size:16px;line-height:1.55;color:${COLORS.text};">${innerHtml}</p>`;
}

export function renderEmailLayout(input: EmailLayoutInput): string {
  const base = input.appUrl.replace(/\/+$/, "");
  const logoUrl = `${base}/icons/icon-192.png`;
  const title = escapeHtml(input.title);
  const preheader = input.preheader ? escapeHtml(input.preheader) : "";

  const button = input.button
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 20px;">
        <tr><td style="border-radius:10px;background:${COLORS.primary};">
          <a href="${escapeHtml(input.button.url)}" style="display:inline-block;padding:14px 28px;font-family:${FONT};font-size:16px;font-weight:600;line-height:1;color:${COLORS.onPrimary};text-decoration:none;border-radius:10px;">${escapeHtml(input.button.label)}</a>
        </td></tr>
      </table>
      <p style="margin:0 0 16px;font-size:13px;line-height:1.5;color:${COLORS.muted};">Se o botão não abrir, copie este endereço e cole no navegador:<br><a href="${escapeHtml(input.button.url)}" style="color:${COLORS.primary};word-break:break-all;">${escapeHtml(input.button.url)}</a></p>`
    : "";

  const footnote = input.footnote
    ? `<p style="margin:8px 0 0;padding-top:16px;border-top:1px solid ${COLORS.line};font-size:13px;line-height:1.5;color:${COLORS.muted};">${escapeHtml(input.footnote)}</p>`
    : "";

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${title}</title>
</head>
<body style="margin:0;padding:0;background:${COLORS.page};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${COLORS.page};">${preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COLORS.page};">
  <tr><td align="center" style="padding:24px 12px;">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">
      <tr><td style="background:${COLORS.header};padding:20px 28px;border-radius:14px 14px 0 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
          <td style="padding-right:12px;"><img src="${escapeHtml(logoUrl)}" width="40" height="40" alt="" style="display:block;border:0;border-radius:9px;"></td>
          <td style="font-family:${FONT};font-size:20px;font-weight:700;color:#ffffff;">${escapeHtml(brand.name)}</td>
        </tr></table>
      </td></tr>
      <tr><td style="background:${COLORS.card};padding:32px 28px;font-family:${FONT};color:${COLORS.text};border-radius:0 0 14px 14px;">
        <h1 style="margin:0 0 20px;font-size:22px;line-height:1.3;font-weight:700;color:${COLORS.text};">${title}</h1>
        ${input.bodyHtml}
        ${button}
        ${footnote}
      </td></tr>
      <tr><td align="center" style="padding:18px 12px 0;font-family:${FONT};font-size:12px;line-height:1.5;color:${COLORS.muted};">
        ${escapeHtml(brand.name)} · <a href="mailto:${escapeHtml(brand.legal.supportEmail)}" style="color:${COLORS.muted};">${escapeHtml(brand.legal.supportEmail)}</a>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}
