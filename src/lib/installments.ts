import type { CardFees, InstallmentInput, PaymentMethod, QuotePaymentPlan, Receivable } from "@/types/finance";
import { addDays } from "./dates";
import { formatCents } from "./money";

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

/**
 * Plano ao fechar: o combinado no orçamento, quando houver; senão, à vista e já recebido. Cartão e
 * parcelas começam em 30 dias.
 */
export function defaultPaymentPlan(today: string, agreed?: QuotePaymentPlan | null): PaymentPlan {
  const base: PaymentPlan = { kind: "cash", method: "pix", receivedNow: true, entryCents: 0, entryMethod: "pix", count: 2, firstDueDate: addDays(today, 30) };
  if (!agreed) return base;
  return {
    ...base,
    kind: agreed.kind,
    method: agreed.kind === "card" ? "credit" : agreed.method,
    // Boleto à vista costuma ser pago depois: não começa como recebido.
    receivedNow: agreed.kind === "cash" ? agreed.method !== "boleto" : true,
    entryCents: agreed.entry_cents,
    entryMethod: agreed.entry_method,
    count: agreed.count,
  };
}

const METHOD_TEXT: Record<PaymentMethod, string> = {
  pix: "no PIX",
  cash: "em dinheiro",
  debit: "no débito",
  credit: "no cartão de crédito",
  boleto: "no boleto",
  transfer: "por transferência",
  other: "",
};

const withMethod = (text: string, method: PaymentMethod | null) => (method && METHOD_TEXT[method] ? `${text} ${METHOD_TEXT[method]}` : text);

/** As condições em texto, para o cliente: no link, no PDF e na mensagem. */
export function paymentPlanText(plan: QuotePaymentPlan | null | undefined, totalCents: number): string | null {
  if (!plan || totalCents <= 0) return null;
  const parts = (cents: number, count: number) => {
    const values = splitCents(cents, count);
    return values.length === 1 ? formatCents(values[0]) : `${values.length}x de ${formatCents(values[values.length - 1])}`;
  };
  if (plan.kind === "cash") return withMethod("À vista", plan.method);
  if (plan.kind === "card") return `Cartão de crédito em ${parts(totalCents, plan.count)}`;
  const entry = Math.min(Math.max(0, plan.entry_cents), totalCents);
  const rest = totalCents - entry;
  const entryText = withMethod(`Entrada de ${formatCents(entry)}`, plan.entry_method);
  if (rest === 0) return entryText;
  return `${entryText} e o restante em ${withMethod(parts(rest, plan.count), plan.method)}`;
}

/** Taxas da maquininha cadastradas pela empresa (Configurações › Impostos e taxas). */
export function cardFeesOf(profile: { card_fee_credit_bps?: number; card_fee_debit_bps?: number }): CardFees {
  return { creditBps: profile.card_fee_credit_bps ?? 0, debitBps: profile.card_fee_debit_bps ?? 0 };
}

/** Taxa da maquininha da parcela: só crédito e débito. Mesma conta de public.card_fee_cents. */
export function cardFeeCents(amountCents: number, method: PaymentMethod | null, fees: CardFees): number {
  const rate = method === "credit" ? fees.creditBps : method === "debit" ? fees.debitBps : 0;
  return Math.round((amountCents * rate) / 10_000);
}

export type ReceivableStatus = "received" | "overdue" | "due_today" | "open";

export function receivableStatus(item: Pick<Receivable, "received_on" | "due_date">, today: string): ReceivableStatus {
  if (item.received_on) return "received";
  if (item.due_date < today) return "overdue";
  return item.due_date === today ? "due_today" : "open";
}

/** O que deve entrar no caixa pela parcela: o valor menos a taxa da maquininha. */
export function expectedCents(item: Pick<Receivable, "amount_cents" | "fee_cents">): number {
  return item.amount_cents - (item.fee_cents ?? 0);
}

/** Totais do que falta receber (já sem a taxa): em aberto, atrasado e o que vence nos próximos dias. */
export function summarizeOpen(items: Pick<Receivable, "received_on" | "due_date" | "amount_cents" | "fee_cents">[], today: string, days = 7) {
  const open = items.filter((item) => !item.received_on);
  const until = addDays(today, days);
  const overdue = open.filter((item) => item.due_date < today);
  const dueSoon = open.filter((item) => item.due_date >= today && item.due_date <= until);
  const total = (list: typeof open) => list.reduce((sum, item) => sum + expectedCents(item), 0);
  return {
    openCents: total(open),
    openCount: open.length,
    overdueCents: total(overdue),
    overdueCount: overdue.length,
    dueSoonCents: total(dueSoon),
    dueSoonCount: dueSoon.length,
  };
}
