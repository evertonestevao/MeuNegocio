import { describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";
import { createMemoryRateLimiter, type RateLimiter } from "@/server/rateLimit";
import type { SignupLead } from "@/types/database";
import { createSignupFlowService, provisionalCompanyName, type SignupLeadRepository } from "./signupFlowService";

const EVIDENCE = { ipAddress: "200.1.2.3", userAgent: "Navegador" };
const CONTEXT = { evidence: EVIDENCE, termsVersionId: "termos-v1" };
const INPUT = { fullName: " Ana Lima ", email: "Ana@Exemplo.com", accept_terms: "on", website: "" };
const LEAD_ID = "6f1c2b9e-1d2a-4c3b-9a8e-0f1e2d3c4b5a";

const open: RateLimiter = { consume: async () => {} };

function setup({ repo: overrides = {}, ipLimiter = open, emailLimiter = open }: { repo?: Partial<SignupLeadRepository>; ipLimiter?: RateLimiter; emailLimiter?: RateLimiter } = {}) {
  const repo = {
    upsertByEmail: vi.fn(async () => LEAD_ID),
    findById: vi.fn(async (): Promise<SignupLead | null> => null),
    deletePending: vi.fn(async () => {}),
    markAccount: vi.fn(async () => {}),
    markDoneByCompany: vi.fn(async () => {}),
    listRecent: vi.fn(async () => []),
    ...overrides,
  } satisfies SignupLeadRepository;
  return { repo, service: createSignupFlowService({ repo, ipLimiter, emailLimiter }) };
}

describe("cadastro em etapas: primeiro passo", () => {
  it("guarda nome, e-mail em minúsculas, escolha, aceite e evidência", async () => {
    const { repo, service } = setup();
    expect(await service.start(INPUT, CONTEXT)).toEqual({ leadId: LEAD_ID });
    expect(repo.upsertByEmail).toHaveBeenCalledWith({
      email: "ana@exemplo.com",
      fullName: "Ana Lima",
      termsVersionId: "termos-v1",
      emailConsent: false,
      evidence: EVIDENCE,
    });
  });

  it("guarda o consentimento de e-mail só quando marcado", async () => {
    const { repo, service } = setup();
    await service.start({ ...INPUT, email_consent: "on" }, CONTEXT);
    expect(vi.mocked(repo.upsertByEmail).mock.calls[0][0]).toMatchObject({ emailConsent: true });
  });

  it("sem aceite dos termos não grava nada", async () => {
    const { repo, service } = setup();
    await expect(service.start({ ...INPUT, accept_terms: undefined }, CONTEXT)).rejects.toThrow(/aceite os Termos/);
    expect(repo.upsertByEmail).not.toHaveBeenCalled();
  });

  it("recusa e-mail inválido", async () => {
    const { service } = setup();
    await expect(service.start({ ...INPUT, email: "ana" }, CONTEXT)).rejects.toThrow(AppError);
  });

  it("robô que preenche o campo escondido recebe resposta normal e nada é gravado", async () => {
    const { repo, service } = setup();
    expect(await service.start({ ...INPUT, website: "http://spam" }, CONTEXT)).toEqual({ leadId: null });
    expect(repo.upsertByEmail).not.toHaveBeenCalled();
  });

  it("limita envios repetidos do mesmo endereço, mesmo inválidos", async () => {
    const { repo, service } = setup({ ipLimiter: createMemoryRateLimiter({ limit: 2, windowMs: 60_000 }) });
    await service.start(INPUT, CONTEXT);
    await expect(service.start({ ...INPUT, email: "x" }, CONTEXT)).rejects.toThrow(AppError);
    await expect(service.start(INPUT, CONTEXT)).rejects.toThrow("Muitas tentativas");
    expect(repo.upsertByEmail).toHaveBeenCalledTimes(1);
  });

  it("limita o mesmo e-mail vindo de endereços diferentes", async () => {
    const { service } = setup({ emailLimiter: createMemoryRateLimiter({ limit: 1, windowMs: 60_000 }) });
    await service.start(INPUT, CONTEXT);
    await expect(
      service.start({ ...INPUT, email: "ANA@exemplo.com" }, { ...CONTEXT, evidence: { ...EVIDENCE, ipAddress: "10.0.0.9" } }),
    ).rejects.toThrow("Muitas tentativas");
  });
});

describe("cadastro em etapas: voltar para corrigir", () => {
  const OLD_ID = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";

  it("trocou o e-mail: apaga o cadastro com o e-mail errado", async () => {
    const findById = vi.fn(async () => ({ id: OLD_ID, stage: "contact" }) as SignupLead);
    const { repo, service } = setup({ repo: { findById } });
    expect(await service.start(INPUT, { ...CONTEXT, previousLeadId: OLD_ID })).toEqual({ leadId: LEAD_ID });
    expect(repo.deletePending).toHaveBeenCalledWith(OLD_ID);
  });

  it("mesmo e-mail atualiza o mesmo cadastro, sem apagar nada", async () => {
    const findById = vi.fn(async () => ({ id: LEAD_ID, stage: "contact" }) as SignupLead);
    const { repo, service } = setup({ repo: { findById } });
    await service.start(INPUT, { ...CONTEXT, previousLeadId: LEAD_ID });
    expect(repo.deletePending).not.toHaveBeenCalled();
  });

  it("cadastro anterior que já virou conta não é apagado", async () => {
    const findById = vi.fn(async () => ({ id: OLD_ID, stage: "account" }) as SignupLead);
    const { repo, service } = setup({ repo: { findById } });
    await service.start(INPUT, { ...CONTEXT, previousLeadId: OLD_ID });
    expect(repo.deletePending).not.toHaveBeenCalled();
  });
});

describe("cadastro em etapas: segundo passo", () => {
  const lead = { id: LEAD_ID, stage: "contact" } as SignupLead;

  it("encontra o cadastro que espera a senha", async () => {
    const { service } = setup({ repo: { findById: vi.fn(async () => lead) } });
    expect(await service.getPending(LEAD_ID)).toBe(lead);
  });

  it("cadastro já usado, id inválido ou ausente recomeça do primeiro passo", async () => {
    const findById = vi.fn(async () => ({ ...lead, stage: "account" as const }));
    const { service } = setup({ repo: { findById } });
    expect(await service.getPending(LEAD_ID)).toBeNull();
    expect(await service.getPending("nao-e-uuid")).toBeNull();
    expect(await service.getPending(undefined)).toBeNull();
    expect(findById).toHaveBeenCalledTimes(1);
  });
});

describe("nome provisório da empresa", () => {
  it("usa o nome da pessoa e respeita o limite de 80 caracteres", () => {
    expect(provisionalCompanyName("Ana Lima")).toBe("Empresa de Ana Lima");
    expect(provisionalCompanyName("A".repeat(120))).toHaveLength(80);
  });
});
