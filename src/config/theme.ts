/**
 * Onde o tema escuro vale: só dentro do sistema logado. Site, login, cadastro, assinatura e o
 * link do orçamento ficam sempre claros, como a marca foi desenhada.
 */
const THEMED_PREFIXES = ["/dashboard", "/admin", "/vendedor"];

export function followsUserTheme(pathname: string): boolean {
  return THEMED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
