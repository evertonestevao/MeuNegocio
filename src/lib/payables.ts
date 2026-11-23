import type { ExpenseInstallment } from "@/types/finance";
import { addDays } from "./dates";
import { MAX_INSTALLMENTS, addMonthsKeepDay, splitCents } from "./installments";

/**
 * Contas a pagar: as parcelas de um gasto. A data do gasto é quando a compra aconteceu (conta no
 * resultado do mês); cada parcela diz quando o dinheiro sai (vencimento) e quando saiu (pago em).
 */

export type PayableMode = "paid" | "pending";

/** Como o gasto vai ser pago: já pago numa data, ou a pagar em N parcelas mensais. */
export interface PayablePlan {
  mode: PayableMode;
  /** Já pago: a data do pagamento. */
  paidOn: string;
  /** A pagar: quantas parcelas (1 = de uma vez). */
  count: number;
  /** A pagar: vencimento da 1ª; as outras, no mesmo dia dos meses seguintes. */
  firstDueDate: string;
}

export interface PlannedInstallment {
  due_date: string;
  amount_cents: number;
  paid_on: string | null;
}

export { MAX_INSTALLMENTS };

/** As parcelas do plano. Os centavos que sobram da divisão vão na primeira, como nas contas a receber. */
export function buildPayableInstallments(totalCents: number, plan: PayablePlan): PlannedInstallment[] {
  if (totalCents <= 0) return [];
  if (plan.mode === "paid") return [{ due_date: plan.paidOn, amount_cents: totalCents, paid_on: plan.paidOn }];
  return splitCents(totalCents, plan.count).map((amount, index) => ({
    due_date: addMonthsKeepDay(plan.firstDueDate, index),
    amount_cents: amount,
    paid_on: null,
  }));
}

/**
 * Plano que a tela mostra ao abrir um gasto: o que ele tem hoje. Gasto novo com data até hoje começa
 * como pago nessa data; com data futura, a pagar nela.
 */
export function currentPayablePlan(installments: Pick<ExpenseInstallment, "due_date" | "paid_on">[], expenseDate: string, today: string): PayablePlan {
  const sorted = installments.toSorted((a, b) => a.due_date.localeCompare(b.due_date));
  if (sorted.length === 0) {
    return expenseDate <= today
      ? { mode: "paid", paidOn: expenseDate, count: 1, firstDueDate: expenseDate }
      : { mode: "pending", paidOn: today, count: 1, firstDueDate: expenseDate };
  }
  if (sorted.length === 1 && sorted[0].paid_on) {
    return { mode: "paid", paidOn: sorted[0].paid_on, count: 1, firstDueDate: sorted[0].due_date };
  }
  return { mode: "pending", paidOn: today, count: sorted.length, firstDueDate: sorted[0].due_date };
}

/** Gasto com mais de uma parcela e alguma paga: valor e parcelas ficam travados até desfazer os pagamentos. */
export function installmentsLocked(installments: Pick<ExpenseInstallment, "paid_on">[]): boolean {
  return installments.length > 1 && installments.some((item) => item.paid_on);
}

export type PayableStatus = "paid" | "overdue" | "due_today" | "open";

export function payableStatus(item: Pick<ExpenseInstallment, "paid_on" | "due_date">, today: string): PayableStatus {
  if (item.paid_on) return "paid";
  if (item.due_date < today) return "overdue";
  return item.due_date === today ? "due_today" : "open";
}

/** Quando o dinheiro sai (ou saiu): a data do pagamento, ou o vencimento enquanto não pago. */
export function outflowDate(item: Pick<ExpenseInstallment, "paid_on" | "due_date">): string {
  return item.paid_on ?? item.due_date;
}

/** Totais do que falta pagar: em aberto, atrasado e o que vence nos próximos dias. */
export function summarizePayables(items: Pick<ExpenseInstallment, "paid_on" | "due_date" | "amount_cents">[], today: string, days = 7) {
  const open = items.filter((item) => !item.paid_on);
  const until = addDays(today, days);
  const overdue = open.filter((item) => item.due_date < today);
  const dueSoon = open.filter((item) => item.due_date >= today && item.due_date <= until);
  const total = (list: typeof open) => list.reduce((sum, item) => sum + item.amount_cents, 0);
  return {
    openCents: total(open),
    openCount: open.length,
    overdueCents: total(overdue),
    overdueCount: overdue.length,
    dueSoonCents: total(dueSoon),
    dueSoonCount: dueSoon.length,
  };
}

/** Resumo do pagamento do gasto, para a lista: "Pago", "A pagar até 10/12" ou "1 de 3 parcelas pagas". */
export function paymentSummary(installments: Pick<ExpenseInstallment, "paid_on" | "due_date">[]): { label: string; settled: boolean; nextDue: string | null } {
  const open = installments.filter((item) => !item.paid_on).toSorted((a, b) => a.due_date.localeCompare(b.due_date));
  const paid = installments.length - open.length;
  if (installments.length === 0 || open.length === 0) {
    return { label: installments.length > 1 ? `${installments.length} parcelas pagas` : "Pago", settled: true, nextDue: null };
  }
  if (installments.length === 1) return { label: "A pagar", settled: false, nextDue: open[0].due_date };
  return { label: `${paid} de ${installments.length} parcelas pagas`, settled: false, nextDue: open[0].due_date };
}
