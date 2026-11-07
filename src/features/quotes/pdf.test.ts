import { describe, expect, it } from "vitest";
import type { QuoteDocument } from "@/types/quotes";
import { clientLines, greetingName, quoteItemDetail, quoteShareText, whatsappUrl } from "./pdf";

const QUOTE = {
  number: 13,
  title: "Ampliação",
  totalCents: 801500,
  validUntil: "2026-11-12",
  company: { name: "Nortec" },
} as QuoteDocument;

describe("envio do orçamento", () => {
  it("monta o texto com o primeiro nome, o total e o link", () => {
    const text = quoteShareText(QUOTE, "Renato Camargo", "https://x/orcamento/abc");
    expect(text).toContain("Olá, Renato! Segue o orçamento Nº 0013 da Nortec.");
    expect(text).toContain("8.015,00");
    expect(text).toContain("Válido até 12/11/2026.");
    expect(text).toContain("aprove por aqui: https://x/orcamento/abc");
  });

  it("sem link liberado pelo plano, não oferece aprovar", () => {
    expect(quoteShareText(QUOTE, null, null)).not.toContain("aprove");
  });

  it("wa.me recebe DDI do Brasil e o texto codificado", () => {
    expect(whatsappUrl("(14) 99712-2258", "a b")).toBe("https://wa.me/5514997122258?text=a%20b");
    expect(whatsappUrl("5514997122258", "x")).toBe("https://wa.me/5514997122258?text=x");
    expect(whatsappUrl(null, "x")).toBe("https://wa.me/?text=x");
  });

  it("descreve hora e preço fechado", () => {
    const base = { description: "", unit: "un", quantity: 2, people: 3, unitPriceCents: 100, lineTotalCents: 0 };
    expect(quoteItemDetail({ ...base, pricingMode: "hourly" })).toContain("2 h × 3 pessoas");
    expect(quoteItemDetail({ ...base, pricingMode: "fixed" })).toContain("2 un ×");
  });
});

describe("greetingName", () => {
  it("usa o primeiro nome e mantém o tratamento", () => {
    expect(greetingName("Carla Mendes")).toBe("Carla");
    expect(greetingName("Dr. Paulo Reis")).toBe("Dr. Paulo");
    expect(greetingName("Dra Helena Prado")).toBe("Dra Helena");
    expect(greetingName("Dr.")).toBe("Dr.");
  });
});

describe("bloco Para do PDF", () => {
  it("leva nome, documento, telefone, e-mail e local", () => {
    expect(
      clientLines({
        client: { name: "Ana Beatriz Gonçalves", document: "29600384363", phone: "14988112031", email: "ana@example.com" },
        location: { name: "Principal", address: "Rua Olavo Bilac, 120 - Centro, Lins/SP" },
      }),
    ).toEqual(["Ana Beatriz Gonçalves · 296.003.843-63", "(14) 98811-2031 · ana@example.com", "Principal — Rua Olavo Bilac, 120 - Centro, Lins/SP"]);
  });

  it("sem contato, não deixa linha vazia", () => {
    expect(clientLines({ client: { name: "Sebastião", document: null, phone: null, email: null }, location: null })).toEqual(["Sebastião"]);
  });
});
