/** Cálculo de horas. Horários são texto HH:MM ou HH:MM:SS, sem data. */

function toMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

/** Minutos trabalhados: saída − entrada − intervalo, nunca negativo. */
export function workedMinutes(entry: { starts_at: string; ends_at: string; break_minutes: number }): number {
  return Math.max(0, toMinutes(entry.ends_at) - toMinutes(entry.starts_at) - Math.max(0, entry.break_minutes));
}

export function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h${String(rest).padStart(2, "0")}` : `${hours}h`;
}

/** Valor a pagar sobre o total de minutos, como no fechamento do mês. */
export function payCents(minutes: number, hourlyCents: number): number {
  return Math.round((minutes / 60) * hourlyCents);
}
