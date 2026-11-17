/** CSV para planilha em português: separador ";", BOM para os acentos e proteção contra fórmula. */

function cell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let text = typeof value === "object" ? JSON.stringify(value) : String(value);
  // Texto digitado por terceiros que começa com =, +, -, @ viraria fórmula na planilha.
  if (/^[=+\-@\t\r]/.test(text) && Number.isNaN(Number(text))) text = `'${text}`;
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function buildCsv(rows: Array<Record<string, unknown>>, columns?: string[]): string {
  const headers = columns ?? Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const lines = [headers.join(";"), ...rows.map((row) => headers.map((header) => cell(row[header])).join(";"))];
  return `﻿${lines.join("\r\n")}\r\n`;
}
