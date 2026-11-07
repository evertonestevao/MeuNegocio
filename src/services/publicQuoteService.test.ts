import { describe, expect, it, vi } from "vitest";
import type { PublicQuote } from "@/types/quotes";
import { createPublicQuoteService } from "./publicQuoteService";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]);

function setup(options: { allowed?: boolean; respondFails?: boolean; recordFails?: boolean } = {}) {
  const repo = {
    getByToken: vi.fn(async () => ({ companyId: "co", quoteId: "q1" }) as PublicQuote),
    recordView: vi.fn(async () => {
      if (options.recordFails) throw new Error("banco fora");
    }),
    respond: vi.fn(async () => {
      if (options.respondFails) throw new Error("recusado pelo banco");
      return { companyId: "co", quoteId: "q1" };
    }),
  };
  const files = { upload: vi.fn(async () => undefined), remove: vi.fn(async () => undefined) };
  const service = createPublicQuoteService({ repo, files, canUsePublicApproval: async () => options.allowed ?? true, newId: () => "id" });
  return { repo, files, service };
}

describe("resposta do cliente pelo link", () => {
  it("aprovar grava a assinatura na pasta do orçamento", async () => {
    const { repo, files, service } = setup();
    await service.respond("t", { decision: "approved", name: "Ana", comment: "", signature: PNG });
    expect(files.upload).toHaveBeenCalledWith("co/q1/id.png", PNG, "image/png");
    expect(repo.respond).toHaveBeenCalledWith("t", "approved", "Ana", "", "co/q1/id.png");
  });

  it("aprovar sem assinatura, ou com arquivo que não é PNG, é recusado", async () => {
    const { repo, files, service } = setup();
    await expect(service.respond("t", { decision: "approved", name: "Ana", comment: "", signature: null })).rejects.toMatchObject({ code: "validation_error" });
    await expect(service.respond("t", { decision: "approved", name: "Ana", comment: "", signature: JPEG })).rejects.toMatchObject({ code: "validation_error" });
    expect(files.upload).not.toHaveBeenCalled();
    expect(repo.respond).not.toHaveBeenCalled();
  });

  it("recusar não pede nem guarda assinatura", async () => {
    const { repo, files, service } = setup();
    await service.respond("t", { decision: "refused", name: "Ana", comment: "Caro", signature: PNG });
    expect(files.upload).not.toHaveBeenCalled();
    expect(repo.respond).toHaveBeenCalledWith("t", "refused", "Ana", "Caro", null);
  });

  it("se o banco recusa a resposta, a assinatura é apagada", async () => {
    const { files, service } = setup({ respondFails: true });
    await expect(service.respond("t", { decision: "approved", name: "Ana", comment: "", signature: PNG })).rejects.toThrow("recusado pelo banco");
    expect(files.remove).toHaveBeenCalledWith("co/q1/id.png");
  });

  it("empresa sem o link no plano não recebe resposta", async () => {
    const { files, service } = setup({ allowed: false });
    await expect(service.respond("t", { decision: "approved", name: "Ana", comment: "", signature: PNG })).rejects.toMatchObject({ code: "not_found" });
    expect(files.upload).not.toHaveBeenCalled();
  });
});

describe("abertura do link", () => {
  const PHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1";

  it("o cliente abrindo pelo celular conta", async () => {
    const { repo, service } = setup();
    expect(await service.recordView("t", { companyId: "co" }, { userAgent: PHONE, memberOfCompanyIds: [] })).toBe(true);
    expect(repo.recordView).toHaveBeenCalledWith("t");
  });

  it("a própria empresa e o robô da prévia do WhatsApp não contam", async () => {
    const { repo, service } = setup();
    expect(await service.recordView("t", { companyId: "co" }, { userAgent: PHONE, memberOfCompanyIds: ["co"] })).toBe(false);
    expect(await service.recordView("t", { companyId: "co" }, { userAgent: "WhatsApp/2.23.20.0 A", memberOfCompanyIds: [] })).toBe(false);
    expect(repo.recordView).not.toHaveBeenCalled();
  });

  it("falha ao gravar não derruba a página do cliente", async () => {
    const { service } = setup({ recordFails: true });
    expect(await service.recordView("t", { companyId: "co" }, { userAgent: PHONE, memberOfCompanyIds: [] })).toBe(false);
  });
});
