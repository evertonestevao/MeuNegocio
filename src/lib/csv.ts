/**
 * Leitura de CSV sem dependência: separador ";" (Excel em português), "," ou tabulação, aspas com
 * aspas dobradas dentro e quebra de linha dentro de aspas.
 */

export function detectDelimiter(firstLine: string): string {
  const counts = [";", ",", "\t"].map((delimiter) => ({ delimiter, count: firstLine.split(delimiter).length - 1 }));
  return counts.sort((a, b) => b.count - a.count)[0].count > 0 ? counts[0].delimiter : ";";
}

export function parseCsv(text: string): string[][] {
  const source = text.replace(/^﻿/, "");
  const delimiter = detectDelimiter(source.split(/\r?\n/, 1)[0] ?? "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') {
        field += '"';
        index++;
      } else if (char === '"') quoted = false;
      else field += char;
      continue;
    }
    if (char === '"' && field === "") quoted = true;
    else if (char === delimiter) {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[index + 1] === "\n") index++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // Linhas em branco (comuns no fim do arquivo do Excel) não contam.
  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ""));
}

/** Texto do arquivo: UTF-8, e Windows-1252 quando o Excel antigo salvou com acento quebrado. */
export function decodeSpreadsheet(bytes: ArrayBuffer): string {
  const utf8 = new TextDecoder("utf-8").decode(bytes);
  return utf8.includes("�") ? new TextDecoder("windows-1252").decode(bytes) : utf8;
}
