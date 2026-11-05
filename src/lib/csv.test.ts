import { describe, expect, it } from "vitest";
import { decodeSpreadsheet, parseCsv } from "./csv";

describe("CSV", () => {
  it("separador do Excel em português, aspas e linhas em branco", () => {
    expect(parseCsv('Nome;Telefone\n"Padaria; Centro";(14) 99999-0000\n\n"Ana ""Bia""";\r\n')).toEqual([
      ["Nome", "Telefone"],
      ["Padaria; Centro", "(14) 99999-0000"],
      ['Ana "Bia"', ""],
    ]);
  });

  it("vírgula, tabulação e quebra de linha dentro de aspas", () => {
    expect(parseCsv("a,b\n1,2")).toEqual([["a", "b"], ["1", "2"]]);
    expect(parseCsv("a\tb\n1\t2")).toEqual([["a", "b"], ["1", "2"]]);
    expect(parseCsv('obs;nome\n"linha 1\nlinha 2";X')).toEqual([["obs", "nome"], ["linha 1\nlinha 2", "X"]]);
  });

  it("acento do Excel antigo (Windows-1252) e marca do UTF-8", () => {
    const latin1 = new Uint8Array([0x45, 0x6e, 0x64, 0x65, 0x72, 0x65, 0xe7, 0x6f]).buffer; // "Endereço"
    expect(decodeSpreadsheet(latin1)).toBe("Endereço");
    expect(parseCsv("﻿Nome\nAna")).toEqual([["Nome"], ["Ana"]]);
  });
});
