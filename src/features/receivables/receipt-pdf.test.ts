import { describe, expect, it } from "vitest";
import type { ReceiptData } from "@/types/finance";
import { receiptNumber, receiptText } from "./receipt-pdf";

const RECEIPT: ReceiptData = {
  company: { name: "Refrigeração Exemplo", cnpj: "12345678000190", phone: null, email: null, address: null, logoUrl: null },
  client: { name: "Condomínio Jardim das Flores", document: "10031676000104" },
  quoteNumber: 54,
  quoteTitle: "Adequação do quadro elétrico",
  installment: { index: 2, total: 3 },
  receivedCents: 500_000,
  receivedOn: "2026-11-06",
  method: "boleto",
};

describe("recibo", () => {
  it("número pelo orçamento e pela parcela", () => {
    expect(receiptNumber(RECEIPT)).toBe("0054-2");
  });

  it("texto com quem pagou, o valor por extenso, a parcela, a data e a forma", () => {
    expect(receiptText(RECEIPT).replace(/ /g, " ")).toBe(
      "Recebemos de Condomínio Jardim das Flores, CNPJ 10.031.676/0001-04, a importância de R$ 5.000,00 (cinco mil reais), referente ao pagamento da parcela 2 de 3 do orçamento Nº 0054 (Adequação do quadro elétrico), recebida em 06/11/2026, por boleto.",
    );
  });

  it("pagamento único não fala em parcela", () => {
    expect(receiptText({ ...RECEIPT, installment: { index: 1, total: 1 }, client: { name: "Ana", document: null }, method: null })).toContain(
      "Recebemos de Ana a importância de",
    );
    expect(receiptText({ ...RECEIPT, installment: { index: 1, total: 1 } })).toContain("referente ao pagamento do orçamento Nº 0054");
  });
});
