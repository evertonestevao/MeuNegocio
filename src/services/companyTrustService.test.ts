import { describe, expect, it, vi } from "vitest";
import { createFakeRegistry } from "@/adapters/companyRegistry/fakeRegistry";
import type { CompanyRegistry } from "@/adapters/companyRegistry/CompanyRegistry";
import { OWNERSHIP_STATEMENT } from "@/features/company/declaration";
import { createMemoryRateLimiter, type RateLimiter } from "@/server/rateLimit";
import { classifyLookup, createCompanyTrustService, namesMatch, personInPartners, type CompanyTrustRepository } from "./companyTrustService";

const EVIDENCE = { ipAddress: "200.1.2.3", userAgent: "Navegador" };
const open: RateLimiter = { consume: async () => {} };

function setup({ registry = createFakeRegistry(), reportLimiter = open }: { registry?: CompanyRegistry; reportLimiter?: RateLimiter } = {}) {
  const repo = {
    insertDeclaration: vi.fn(async () => {}),
    insertCnpjCheck: vi.fn<CompanyTrustRepository["insertCnpjCheck"]>(async () => {}),
    insertAbuseReport: vi.fn(async () => {}),
    setSuspension: vi.fn(async () => {}),
  } satisfies CompanyTrustRepository;
  return { repo, service: createCompanyTrustService({ repo, registry, reportLimiter }) };
}

describe("comparação de nomes", () => {
  it("confere com a razão social ou com o nome fantasia, sem acento nem sufixo", () => {
    expect(namesMatch("Clima Sul Refrigeração", "CLIMA SUL REFRIGERACAO LTDA", null)).toBe(true);
    expect(namesMatch("Exemplo Refrigeração", "EMPRESA EXEMPLO SERVICOS LTDA", "EXEMPLO REFRIGERACAO")).toBe(true);
  });

  it("nome de outra empresa não confere; palavras genéricas não contam", () => {
    expect(namesMatch("Padaria Pão Dourado", "EMPRESA EXEMPLO SERVICOS LTDA", "EXEMPLO REFRIGERACAO")).toBe(false);
    expect(namesMatch("Serviços Ltda", "EMPRESA EXEMPLO SERVICOS LTDA", null)).toBe(false);
  });

  it("quem declarou está no quadro de sócios pelo primeiro e último nome; sem sócios na base, não se sabe", () => {
    expect(personInPartners("Ana Lima", ["ANA EXEMPLO LIMA"])).toBe(true);
    expect(personInPartners("Ana Souza", ["ANA EXEMPLO LIMA"])).toBe(false);
    expect(personInPartners("Ana", ["ANA EXEMPLO LIMA"])).toBe(false);
    expect(personInPartners("Ana Lima", [])).toBeNull();
  });

  it("classifica: inexistente, inativo, nome diferente, confere, base fora do ar", () => {
    const found = (situation: string) => ({ status: "found" as const, record: { cnpj: "1", officialName: "CLIMA SUL LTDA", tradeName: null, situation, openedOn: null, city: null, state: null, partnerNames: [] } });
    expect(classifyLookup({ status: "not_found" }, "Clima Sul")).toBe("not_found");
    expect(classifyLookup({ status: "unavailable" }, "Clima Sul")).toBe("unavailable");
    expect(classifyLookup(found("BAIXADA"), "Clima Sul")).toBe("inactive");
    expect(classifyLookup(found("ATIVA"), "Padaria Central")).toBe("name_mismatch");
    expect(classifyLookup(found("ATIVA"), "Clima Sul")).toBe("match");
  });
});

describe("conferência do CNPJ", () => {
  it("guarda a conclusão e os dados públicos, sem a lista de sócios", async () => {
    const { repo, service } = setup();
    expect(await service.checkCnpj({ companyId: "c1", cnpj: "11.222.333/0001-81", informedName: "Exemplo Refrigeração", declarantName: "Ana Lima" })).toBe("match");
    const row = vi.mocked(repo.insertCnpjCheck).mock.calls[0][0];
    expect(row).toMatchObject({ cnpj: "11222333000181", result: "match", officialName: "EMPRESA EXEMPLO SERVICOS LTDA", declarantInPartners: true, source: "fake" });
    expect(JSON.stringify(row)).not.toContain("ANA EXEMPLO LIMA");
  });

  it("base fora do ar não bloqueia: guarda 'unavailable'", async () => {
    const { repo, service } = setup({ registry: { name: "x", lookup: async () => ({ status: "unavailable" }) } });
    expect(await service.checkCnpj({ companyId: "c1", cnpj: "11222333000181", informedName: "X", declarantName: "Ana Lima" })).toBe("unavailable");
    expect(vi.mocked(repo.insertCnpjCheck).mock.calls[0][0]).toMatchObject({ result: "unavailable", declarantInPartners: null });
  });
});

describe("declaração de responsabilidade", () => {
  const input = { companyId: "c1", userId: "u1", userName: "Ana Lima", userEmail: "ana@x.com", companyName: "Clima Sul", cnpj: null, termsVersionId: "t2", evidence: EVIDENCE };

  it("sem marcar, não segue; marcada, guarda o texto exato com a evidência", async () => {
    const { repo, service } = setup();
    await expect(service.declare(input, undefined)).rejects.toMatchObject({ code: "validation_error" });
    expect(repo.insertDeclaration).not.toHaveBeenCalled();
    await service.declare(input, "on");
    expect(repo.insertDeclaration).toHaveBeenCalledWith({ ...input, statement: OWNERSHIP_STATEMENT });
  });
});

describe("denúncia", () => {
  const context = { companyId: "c1", quoteId: "q1", evidence: EVIDENCE };
  const valid = { reason: "impersonation", message: "Esta empresa não é a que diz ser.", reporterName: "", reporterContact: "cliente@x.com", companyName: "", website: "" };

  it("guarda com a empresa, o orçamento e a evidência", async () => {
    const { repo, service } = setup();
    await service.report(valid, context);
    expect(repo.insertAbuseReport).toHaveBeenCalledWith(expect.objectContaining({ companyId: "c1", quoteId: "q1", reason: "impersonation", reporterName: null, evidence: EVIDENCE }));
  });

  it("recusa sem contato ou com mensagem curta; robô não grava", async () => {
    const { repo, service } = setup();
    await expect(service.report({ ...valid, reporterContact: "" }, context)).rejects.toMatchObject({ code: "validation_error" });
    await expect(service.report({ ...valid, message: "golpe" }, context)).rejects.toMatchObject({ code: "validation_error" });
    await service.report({ ...valid, website: "http://spam" }, context);
    expect(repo.insertAbuseReport).not.toHaveBeenCalled();
  });

  it("limita denúncias repetidas do mesmo endereço", async () => {
    const { service } = setup({ reportLimiter: createMemoryRateLimiter({ limit: 1, windowMs: 60_000 }) });
    await service.report(valid, context);
    await expect(service.report(valid, context)).rejects.toThrow("Muitas tentativas");
  });
});

describe("suspensão", () => {
  it("exige motivo", async () => {
    const { repo, service } = setup();
    await expect(service.setSuspension({ companyId: "c1", suspend: true, reason: "x", actorId: "a", actorEmail: "a@x" })).rejects.toMatchObject({ code: "validation_error" });
    await service.setSuspension({ companyId: "c1", suspend: true, reason: "Denúncia de cliente confirmada", actorId: "a", actorEmail: "a@x" });
    expect(repo.setSuspension).toHaveBeenCalledWith({ companyId: "c1", suspend: true, reason: "Denúncia de cliente confirmada", actorId: "a", actorEmail: "a@x" });
  });
});
