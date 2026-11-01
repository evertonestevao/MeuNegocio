/** Demonstração pública: navega pelas telas reais com dados fictícios, sem tocar no banco. */
export const DEMO_COOKIE = "demo_mode";
export type DemoProfile = "owner" | "technician";
export const DEMO_READ_ONLY_CODE = "DEMO_READ_ONLY";
export const DEMO_READ_ONLY_MESSAGE = "Na demonstração não é possível salvar. Fale conosco para contratar.";

/** Só estas áreas funcionam em demonstração. Sair delas encerra a demonstração. */
export function isDemoPath(pathname: string): boolean {
  return pathname === "/dashboard" || pathname.startsWith("/dashboard/") || pathname.startsWith("/api/account/");
}
