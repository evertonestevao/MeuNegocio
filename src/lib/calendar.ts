import { addDays } from "./dates";

/** Calendário com datas AAAA-MM-DD. Semana de domingo a sábado, como no protótipo. */

function weekday(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

export function startOfWeek(date: string): string {
  return addDays(date, -weekday(date));
}

export function weekDays(date: string): string[] {
  const start = startOfWeek(date);
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

export function startOfMonth(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

export function addMonths(date: string, months: number): string {
  const [year, month] = date.split("-").map(Number);
  const value = new Date(Date.UTC(year, month - 1 + months, 1));
  return value.toISOString().slice(0, 10);
}

/** Semanas completas que cobrem o mês; dias de fora completam a grade. */
export function monthGrid(date: string): string[] {
  const first = startOfMonth(date);
  const start = startOfWeek(first);
  const last = addDays(addMonths(first, 1), -1);
  const days = Math.ceil((weekday(first) + Number(last.slice(8))) / 7) * 7;
  return Array.from({ length: days }, (_, index) => addDays(start, index));
}

export function isValidDate(value: string | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function formatMonth(date: string): string {
  const text = new Date(`${date}T12:00:00Z`).toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function formatLongDay(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}

/** Horários [início, fim) se sobrepõem? Encostar não conta. */
export function timesOverlap(startA: string, endA: string, startB: string, endB: string): boolean {
  return startA < endB && startB < endA;
}
