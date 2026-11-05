import { describe, expect, it } from "vitest";
import { mapHeaders, previewImport } from "./import";

const HEADER = ["Razão Social", "CNPJ", "Celular", "E-mail", "Responsável", "Endereço", "Cidade", "Obs"];

describe("importação de clientes", () => {
  it("reconhece cabeçalhos com e sem acento, em qualquer ordem", () => {
    expect(mapHeaders(HEADER)).toEqual({ name: 0, document: 1, phone: 2, email: 3, contact: 4, address: 5, city: 6, notes: 7 });
    expect(mapHeaders(["Telefone", "Cliente", "Coluna que não importa"])).toEqual({ phone: 0, name: 1 });
  });

  it("monta cliente, contato principal e local; sem contato, o contato leva o nome do cliente", () => {
    const [first, second] = previewImport(
      [HEADER, ["Padaria", "12345678000190", "14999990000", "a@b.com", "João", "Rua A, 10", "Bauru/SP", "manhã"], ["Ana Lima", "", "14 3333-1000", "", "", "", "", ""]],
      [],
    );
    expect(first).toMatchObject({
      line: 2,
      status: "ready",
      row: { name: "Padaria", document: "12345678000190", contact: { name: "João", phone: "(14) 99999-0000", email: "a@b.com" }, location: { name: "Principal", address: "Rua A, 10 - Bauru/SP" } },
    });
    expect(second.row).toMatchObject({ contact: { name: "Ana Lima", phone: "(14) 3333-1000", email: null }, location: null, document: null });
  });

  it("aponta o erro da linha e pula quem já existe ou se repete", () => {
    const lines = previewImport(
      [
        ["Nome", "CPF/CNPJ", "Telefone", "E-mail"],
        ["", "", "", ""],
        ["Bia", "123", "", ""],
        ["Carla", "", "999", ""],
        ["Davi", "", "", "sem-arroba"],
        ["Cerâmica Vale Verde", "", "", ""],
        ["Eva", "111.444.777-35", "", ""],
        ["Eva Duplicada", "11144477735", "", ""],
        ["Fábio", "", "", ""],
        ["FABIO", "", "", ""],
      ],
      [{ name: "ceramica vale verde", document: null }],
    );
    expect(lines.map((line) => [line.line, line.status, line.message])).toEqual([
      [2, "error", "Sem nome do cliente."],
      [3, "error", "CPF ou CNPJ incompleto."],
      [4, "error", "Telefone sem DDD ou incompleto."],
      [5, "error", "E-mail inválido."],
      [6, "duplicate", "Cliente com este nome já cadastrado."],
      [7, "ready", null],
      [8, "duplicate", "CPF/CNPJ já cadastrado."],
      [9, "ready", null],
      [10, "duplicate", "Cliente com este nome já cadastrado."],
    ]);
  });

  it("sem coluna de nome, não há o que importar", () => {
    expect(previewImport([["Telefone"], ["14999990000"]], [])).toEqual([]);
  });
});
