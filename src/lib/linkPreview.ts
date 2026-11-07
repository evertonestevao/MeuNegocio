/**
 * Robôs que abrem o link só para montar a prévia (WhatsApp, Telegram, redes sociais) ou para
 * indexar. A abertura deles não é o cliente lendo o orçamento.
 */
const PREVIEW_AGENT = /bot|crawler|spider|preview|whatsapp|facebookexternalhit|facebookcatalog|telegram|slack|discord|skype|linkedin|pinterest|embedly|vkshare|curl|wget|python-requests|headless/i;

export function isLinkPreviewAgent(userAgent: string | null | undefined): boolean {
  if (!userAgent?.trim()) return true;
  return PREVIEW_AGENT.test(userAgent);
}
