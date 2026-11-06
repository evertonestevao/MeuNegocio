import type { CnpjCheckResult } from "@/types/database";

export const CNPJ_RESULT_LABEL: Record<CnpjCheckResult, { label: string; tone: "default" | "secondary" | "destructive" | "outline" }> = {
  match: { label: "CNPJ confere", tone: "secondary" },
  name_mismatch: { label: "Nome não confere com o CNPJ", tone: "destructive" },
  inactive: { label: "CNPJ não está ativo", tone: "destructive" },
  not_found: { label: "CNPJ não existe na Receita", tone: "destructive" },
  unavailable: { label: "Consulta do CNPJ indisponível", tone: "outline" },
};

export function partnersLabel(value: boolean | null): string {
  if (value === null) return "Quadro de sócios não informado na base";
  return value ? "Quem declarou aparece no quadro de sócios" : "Quem declarou NÃO aparece no quadro de sócios";
}
