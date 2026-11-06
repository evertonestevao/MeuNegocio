/**
 * Destino de redirect vindo de fora (`?next=`, campo de formulário): só caminho interno.
 *
 * Não basta olhar se começa com "/" e não com "//": o navegador trata "\" como "/" e
 * ignora tab e quebra de linha na URL, então "/\evil.com" e "/\t/evil.com" viram
 * "//evil.com", outro site. Recusa esses caracteres e confere, resolvendo contra uma
 * origem fictícia, que o destino continua na mesma origem.
 */
const PLACEHOLDER_ORIGIN = "http://destino.invalid";

export function safeInternalPath(value: unknown, fallback: string): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return fallback;
  if (/[\\\x00-\x1f\x7f]/.test(value)) return fallback;
  try {
    const url = new URL(value, PLACEHOLDER_ORIGIN);
    if (url.origin !== PLACEHOLDER_ORIGIN) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
