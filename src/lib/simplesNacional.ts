import type { SimplesAnnex } from "@/types/tax";

/**
 * Faixas do Simples Nacional (LC 123/2006, redação da LC 155/2016) para os anexos de serviço.
 * Mesma tabela de simples_bracket no banco, que é quem grava a alíquota na aprovação; aqui serve à
 * prévia na tela enquanto a pessoa digita e à demonstração.
 */

export interface SimplesBracket {
  bracket: number;
  limitCents: number;
  nominalBps: number;
  deductionCents: number;
}

const row = (bracket: number, limitReais: number, nominalPercent: number, deductionReais: number): SimplesBracket => ({
  bracket,
  limitCents: limitReais * 100,
  nominalBps: Math.round(nominalPercent * 100),
  deductionCents: deductionReais * 100,
});

export const SIMPLES_BRACKETS: Record<SimplesAnnex, SimplesBracket[]> = {
  III: [row(1, 180_000, 6, 0), row(2, 360_000, 11.2, 9_360), row(3, 720_000, 13.5, 17_640), row(4, 1_800_000, 16, 35_640), row(5, 3_600_000, 21, 125_640), row(6, 4_800_000, 33, 648_000)],
  IV: [row(1, 180_000, 4.5, 0), row(2, 360_000, 9, 8_100), row(3, 720_000, 10.2, 12_420), row(4, 1_800_000, 14, 39_780), row(5, 3_600_000, 22, 183_780), row(6, 4_800_000, 33, 828_000)],
  V: [row(1, 180_000, 15.5, 0), row(2, 360_000, 18, 4_500), row(3, 720_000, 19.5, 9_900), row(4, 1_800_000, 20.5, 17_100), row(5, 3_600_000, 23, 62_100), row(6, 4_800_000, 30.5, 540_000)],
};

/** Teto do Simples Nacional: acima dele a empresa sai do regime. */
export const SIMPLES_LIMIT_CENTS = 480_000_000;

/** Anexo V com folha de 28% ou mais do faturamento (Fator R) é tributado pelo Anexo III. */
export function effectiveAnnex(annex: SimplesAnnex, fatorR: boolean): SimplesAnnex {
  return annex === "V" && fatorR ? "III" : annex;
}

/**
 * RBT12: soma dos 12 meses anteriores. Com menos de 12 meses de atividade, média dos meses × 12; sem
 * nenhum mês anterior, zero (fica na primeira faixa).
 */
export function rbt12Cents(monthAmountsCents: number[], activeMonths = 12): number {
  const total = monthAmountsCents.reduce((sum, amount) => sum + amount, 0);
  if (activeMonths <= 0) return 0;
  return activeMonths < 12 ? Math.round((total / activeMonths) * 12) : total;
}

/** Faixa e alíquota efetiva: (RBT12 × nominal − parcela a deduzir) ÷ RBT12. */
export function simplesRate(annex: SimplesAnnex, rbt12: number) {
  const brackets = SIMPLES_BRACKETS[annex];
  const bracket = brackets.find((candidate) => rbt12 <= candidate.limitCents) ?? brackets[brackets.length - 1];
  const rateBps = rbt12 === 0 ? bracket.nominalBps : Math.round(((rbt12 * bracket.nominalBps) / 10_000 - bracket.deductionCents) / rbt12 * 10_000);
  return { ...bracket, rateBps, overLimit: rbt12 > SIMPLES_LIMIT_CENTS };
}
