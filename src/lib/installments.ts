import type { InstallmentInput, PaymentMethod, Receivable } from "@/types/finance";
import { addDays } from "./dates";

/**
 * Como o cliente paga um serviço fechado: à vista, entrada + parcelas, cartão em N vezes ou do
 * jeito que a pessoa montar. O banco confere de novo que as parcelas somam o valor fechado.
 */

export type PaymentPlanKind = "cash" | "entry" | "card" | "custom";

export interface PaymentPlan {
  kind: PaymentPlanKind;
  /** Forma da parcela à vista, da entrada ou das parcelas do restante. */
  method: PaymentMethod | null;
  /** À vista ou entrada: já entrou no caixa? */
  receivedNow: boolean;
  entryCents: number;
  entryMethod: PaymentMethod | null;
  /** Parcelas do restante (entrada) ou do cartão. */
  count: number;
  /** Vencimento da primeira parcela; as outras, um mês depois cada. */
  firstDueDate: string;
}

export const MAX_INSTALLMENTS = 60;

/** Mesmo dia nos meses seguintes; no mês mais curto, o último dia. */
export function addMonthsKeepDay(date: string, months: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, month - 1 + months + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month - 1 + months, Math.min(day, lastDay))).toISOString().slice(0, 10);
}

/** Divide em parcelas iguais; os centavos que sobram vão na primeira. */
export function splitCents(totalCents: number, count: number): number[] {
  const safe = Math.max(1, Math.min(MAX_INSTALLMENTS, Math.floor(count)));
  const base = Math.floor(totalCents / safe);
  return Array.from({ length: safe }, (_, index) => (index === 0 ? totalCents - base * (safe - 1) : base));
}

function monthly(totalCents: number, count: number, firstDueDate: string, method: PaymentMethod | null): InstallmentInput[] {
  return splitCents(totalCents, count).map((amount, index) => ({
    amount_cents: amount,
    due_date: addMonthsKeepDay(firstDueDate, index),
    method,
    received: false,
  }));
}

/** Parcelas do plano. "custom" não gera nada: a pessoa monta à mão. */
export function buildInstallments(totalCents: number, plan: PaymentPlan, today: string): InstallmentInput[] {
  if (totalCents <= 0) return [];
  switch (plan.kind) {
    case "cash":
      return [{ amount_cents: totalCents, due_date: today, method: plan.method, received: plan.receivedNow }];
    case "entry": {
      const entry = Math.min(Math.max(0, plan.entryCents), totalCents);
      const rest = totalCents - entry;
      const first = entry > 0 ? [{ amount_cents: entry, due_date: today, method: plan.entryMethod, received: plan.receivedNow }] : [];
      return rest > 0 ? [...first, ...monthly(rest, plan.count, plan.firstDueDate, plan.method)] : first;
    }
    case "card":
      return monthly(totalCents, plan.count, plan.firstDueDate, "credit");
    case "custom":
      return [];
  }
}

/** Plano padrão ao fechar: à vista, já recebido. Cartão e parcelas começam em 30 dias. */
export function defaultPaymentPlan(today: string): PaymentPlan {
  return { kind: "cash", method: "pix", receivedNow: true, entryCents: 0, entryMethod: "pix", count: 2, firstDueDate: addDays(today, 30) };
}

export type ReceivableStatus = "received" | "overdue" | "due_today" | "open";

export function receivableStatus(item: Pick<Receivable, "received_on" | "due_date">, today: string): ReceivableStatus {
  if (item.received_on) return "received";
  if (item.due_date < today) return "overdue";
  return item.due_date === today ? "due_today" : "open";
}

/** Totais do que falta receber: em aberto, atrasado e o que vence nos próximos dias. */
export function summarizeOpen(items: Pick<Receivable, "received_on" | "due_date" | "amount_cents">[], today: string, days = 7) {
  const open = items.filter((item) => !item.received_on);
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
