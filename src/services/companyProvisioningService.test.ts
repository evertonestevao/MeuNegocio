import { describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";
import { createCompanyProvisioningService, provisionCompanySchema, type CompanyProvisioningRepository } from "./companyProvisioningService";

const INPUT = { companyName: "Clima Sul", ownerName: "Ana Lima", ownerEmail: "Ana@Exemplo.com", planId: null };

function setup(overrides: Partial<CompanyProvisioningRepository> = {}) {
  const repo = {
    createOwner: vi.fn(async () => "user-1"),
    deleteOwner: vi.fn(async () => {}),
    createCompany: vi.fn(async () => {}),
    ...overrides,
  } satisfies CompanyProvisioningRepository;
  const service = createCompanyProvisioningService({ repo, generatePassword: () => "temporaria", randomSuffix: () => "ab12" });
  return { repo, service };
}

describe("criação de empresa pelo super admin", () => {
  it("cria o responsável e a empresa, e devolve a senha temporária", async () => {
    const { repo, service } = setup();
    expect(await service.provision(INPUT, "admin")).toEqual({ email: "ana@exemplo.com", temporaryPassword: "temporaria" });
    expect(repo.createOwner).toHaveBeenCalledWith({ email: "ana@exemplo.com", fullName: "Ana Lima", password: "temporaria" });
    expect(repo.createCompany).toHaveBeenCalledWith({ name: "Clima Sul", slug: "clima-sul", ownerId: "user-1", planId: null, actorId: "admin" });
  });

  it("nome em uso tenta com sufixo", async () => {
    const createCompany = vi.fn().mockRejectedValueOnce(new AppError("conflict", "em uso")).mockResolvedValueOnce(undefined);
    const { repo, service } = setup({ createCompany });
    await service.provision(INPUT, "admin");
    expect(createCompany.mock.calls[1][0].slug).toBe("clima-sul-ab12");
    expect(repo.deleteOwner).not.toHaveBeenCalled();
  });

  it("falha na empresa não deixa acesso solto", async () => {
    const { repo, service } = setup({ createCompany: vi.fn().mockRejectedValue(new AppError("internal_error", "falhou")) });
    await expect(service.provision(INPUT, "admin")).rejects.toThrow("falhou");
    expect(repo.deleteOwner).toHaveBeenCalledWith("user-1");
  });

  it("e-mail em uso não cria nada", async () => {
    const { repo, service } = setup({ createOwner: vi.fn().mockRejectedValue(new AppError("conflict", "em uso")) });
    await expect(service.provision(INPUT, "admin")).rejects.toThrow("em uso");
    expect(repo.createCompany).not.toHaveBeenCalled();
    expect(repo.deleteOwner).not.toHaveBeenCalled();
  });

  it("valida os campos", () => {
    expect(provisionCompanySchema.safeParse({ companyName: "x", ownerName: "Ana", ownerEmail: "a@b.co", planId: "" }).success).toBe(false);
    expect(provisionCompanySchema.safeParse({ companyName: "Clima", ownerName: "Ana", ownerEmail: "invalido", planId: "" }).success).toBe(false);
    expect(provisionCompanySchema.parse({ companyName: "Clima", ownerName: "Ana", ownerEmail: "a@b.co", planId: "" }).planId).toBeNull();
  });
});
