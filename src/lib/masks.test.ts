import { describe, expect, it } from "vitest";
import { finishMoney, formatDocument, formatPhone, maskCnpj, maskCpfCnpj, maskMoney, maskPhone } from "./masks";
import { parseMoneyToCents } from "./money";

describe("máscaras", () => {
  it("CNPJ, inclusive enquanto digita", () => {
    expect(maskCnpj("11222333000181")).toBe("11.222.333/0001-81");
    expect(maskCnpj("112223")).toBe("11.222.3");
    expect(maskCnpj("11.222.333/0001-81999")).toBe("11.222.333/0001-81");
  });

  it("CPF ou CNPJ pela quantidade de dígitos", () => {
    expect(maskCpfCnpj("52998224725")).toBe("529.982.247-25");
    expect(maskCpfCnpj("529982247251")).toBe("52.998.224/7251");
  });

  it("telefone fixo, celular e parcial", () => {
    expect(maskPhone("1433331000")).toBe("(14) 3333-1000");
    expect(maskPhone("14999990000")).toBe("(14) 99999-0000");
    expect(maskPhone("14")).toBe("(14");
    expect(maskPhone("149")).toBe("(14) 9");
    expect(maskPhone("+55 14 99999-0000")).toBe("(14) 99999-0000");
    expect(maskPhone("")).toBe("");
  });

  it("valor não muda de grandeza ao digitar", () => {
    expect(maskMoney("150")).toBe("150");
    expect(maskMoney("1234,5")).toBe("1.234,5");
    expect(maskMoney("1234567,891")).toBe("1.234.567,89");
    expect(maskMoney(",5")).toBe("0,5");
    expect(maskMoney("007")).toBe("7");
    expect(maskMoney("abc")).toBe("");
  });

  it("valor colado com ponto: decimal ou milhar", () => {
    expect(maskMoney("149.90")).toBe("149,90");
    expect(maskMoney("1.234")).toBe("1.234");
  });

  it("o valor fechado continua legível pelo servidor", () => {
    expect(finishMoney("150")).toBe("150,00");
    expect(finishMoney("1234,5")).toBe("1.234,50");
    expect(finishMoney("")).toBe("");
    expect(parseMoneyToCents(finishMoney("1234,5"))).toBe(123450);
    expect(parseMoneyToCents(maskMoney("1234"))).toBe(123400);
  });

  it("exibição não estraga dado antigo fora do padrão", () => {
    expect(formatPhone("14999990000")).toBe("(14) 99999-0000");
    expect(formatPhone("ramal 12")).toBe("ramal 12");
    expect(formatDocument("98765432000110")).toBe("98.765.432/0001-10");
    expect(formatDocument("123")).toBe("123");
  });
});
