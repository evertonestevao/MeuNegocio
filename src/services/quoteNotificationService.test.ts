import { describe, expect, it, vi } from "vitest";
import { createQuoteNotificationService, quoteResponseEmail, type QuoteResponse } from "./quoteNotificationService";

const SUMMARY = { companyName: "Refrigeração Exemplo", quoteNumber: 12, quoteTitle: "Troca de compressor", clientName: "Cerâmica Vale Verde", totalCents: 150_000 };
const APPROVED: QuoteResponse = { companyId: "co", quoteId: "q1", decision: "approved", name: "Marina Souza", comment: "Pode ser na terça." };
const nbsp = (text: string) => text.replace(/ /g, " ");

describe("aviso de resposta do orçamento", () => {
  it("assunto direto, quem respondeu, o valor, a observação e o link", () => {
    const email = quoteResponseEmail(SUMMARY, APPROVED, "https://app/dashboard/quotes/q1");
    expect(email.subject).toBe("Cerâmica Vale Verde aprovou o orçamento Nº 0012");
    expect(nbsp(email.text!)).toContain("Marina Souza aprovou e assinou o orçamento Nº 0012 (Troca de compressor), de R$ 1.500,00, pelo link.");
    expect(email.text).toContain("Observação: Pode ser na terça.");
    expect(email.html).toContain('href="https://app/dashboard/quotes/q1"');
  });

  it("na recusa, mostra o motivo", () => {
    const email = quoteResponseEmail(SUMMARY, { ...APPROVED, decision: "refused", comment: "Ficou caro." }, "x");
    expect(email.subject).toBe("Cerâmica Vale Verde recusou o orçamento Nº 0012");
    expect(email.text).toContain("Motivo: Ficou caro.");
  });

  it("o que o cliente digita não vira HTML no e-mail", () => {
    const email = quoteResponseEmail(SUMMARY, { ...APPROVED, name: "<b>Ana</b>", comment: '<a href="https://golpe">clique</a>' }, "https://app/dashboard/quotes/q1");
    expect(email.html).not.toContain("<b>Ana</b>");
    expect(email.html).toContain("&lt;b&gt;Ana&lt;/b&gt;");
    expect(email.html).not.toContain('<a href="https://golpe">');
  });

  it("um e-mail para cada responsável, sem repetir; sem responsável, nada sai", async () => {
    const provider = { name: "teste", send: vi.fn(async () => undefined) };
    const readers = { getQuoteSummary: vi.fn(async () => SUMMARY), listManagerEmails: vi.fn(async () => ["dono@x.com", "admin@x.com", "dono@x.com"]) };
    const service = createQuoteNotificationService({ readers, provider, appUrl: "https://app/" });
    expect(await service.notifyResponse(APPROVED)).toBe(2);
    expect(provider.send).toHaveBeenCalledWith(expect.objectContaining({ to: "admin@x.com", subject: "Cerâmica Vale Verde aprovou o orçamento Nº 0012" }));
    readers.listManagerEmails.mockResolvedValueOnce([]);
    expect(await service.notifyResponse(APPROVED)).toBe(0);
  });

  it("falha de um envio não impede os outros; falha de todos é avisada a quem chamou", async () => {
    const provider = { name: "teste", send: vi.fn(async ({ to }: { to: string }) => { if (to === "admin@x.com") throw new Error("caixa cheia"); }) };
    const readers = { getQuoteSummary: async () => SUMMARY, listManagerEmails: async () => ["dono@x.com", "admin@x.com"] };
    const service = createQuoteNotificationService({ readers, provider, appUrl: "https://app" });
    expect(await service.notifyResponse(APPROVED)).toBe(1);
    const broken = createQuoteNotificationService({ readers, provider: { name: "x", send: async () => { throw new Error("fora do ar"); } }, appUrl: "https://app" });
    await expect(broken.notifyResponse(APPROVED)).rejects.toThrow("fora do ar");
  });
});
