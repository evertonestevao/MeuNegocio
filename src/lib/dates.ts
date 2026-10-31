/** Datas de negócio são texto AAAA-MM-DD, sem hora, para o fuso nunca deslocar o dia. */

export function formatDate(date: string | null | undefined): string {
  if (!date) return "—";
  const [year, month, day] = date.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}

export function todayInTimezone(timezone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(now);
}

export function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function formatTimestamp(timestamp: string | null | undefined, timezone = "America/Sao_Paulo"): string {
  if (!timestamp) return "—";
  return new Date(timestamp).toLocaleDateString("pt-BR", { timeZone: timezone });
}

/** Número decimal para exibir: 2,5 em vez de 2.5. */
export function formatQuantity(value: number): string {
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
}
