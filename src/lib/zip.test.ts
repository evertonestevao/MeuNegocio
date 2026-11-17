import { describe, expect, it } from "vitest";
import { buildCsv } from "./csvExport";
import { buildZip, crc32 } from "./zip";

describe("zip sem dependência", () => {
  it("calcula o CRC-32 padrão", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });

  it("gera um zip legível com os arquivos e nomes em UTF-8", () => {
    const zip = buildZip([{ name: "clientes.csv", content: "a;b\r\n" }, { name: "orçamentos.csv", content: "x" }]);
    const view = new DataView(zip.buffer);
    expect(view.getUint32(0, true)).toBe(0x04034b50); // cabeçalho local
    expect(view.getUint32(zip.length - 22, true)).toBe(0x06054b50); // fim do diretório
    expect(view.getUint16(zip.length - 22 + 10, true)).toBe(2);
    expect(new TextDecoder().decode(zip)).toContain("orçamentos.csv");
  });
});

describe("csv de exportação", () => {
  it("usa ; e BOM, escapa aspas e quebras e neutraliza fórmulas", () => {
    const csv = buildCsv([{ nome: 'Ana "A"', obs: "=1+1", n: -5, ok: true, vazio: null }], ["nome", "obs", "n", "ok", "vazio"]);
    expect(csv.startsWith("﻿nome;obs;n;ok;vazio")).toBe(true);
    expect(csv).toContain('"Ana ""A""";\'=1+1;-5;true;');
  });
});
