import type { RoleCode } from "@/types/database";

/** Nome dos papéis na tela. O código em inglês fica só no banco e nas regras. */
export const ROLE_LABEL: Record<RoleCode, string> = {
  owner: "Proprietário",
  admin: "Administrador",
  member: "Membro",
  technician: "Técnico",
};

/** Papel desconhecido nunca aparece como código: vira um texto neutro. */
export function roleLabel(role: string): string {
  return ROLE_LABEL[role as RoleCode] ?? "Outro papel";
}
