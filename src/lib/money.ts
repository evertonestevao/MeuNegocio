/** Converte "1.234,56", "149,90" ou "149" em centavos; null se não for um valor válido. */
export function parseMoneyToCents(input: string): number | null {
  const text = input.trim();
  if (!/^(\d{1,3}(\.\d{3})+|\d+)(,\d{1,2})?$/.test(text)) return null;
  const [whole, fraction = ""] = text.replace(/\./g, "").split(",");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

export function formatCents(cents: number, currency = "BRL"): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency });
}

/** Valor para preencher um campo de dinheiro, sem o símbolo: "149,90". */
export function centsToMoneyInput(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, useGrouping: false });
}
