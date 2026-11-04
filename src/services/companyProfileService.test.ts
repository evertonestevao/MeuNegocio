import { describe, expect, it, vi } from "vitest";
import { companyProfileSchema, createCompanyProfileService } from "./companyProfileService";

const VALID = { cnpj: "", phone: "", email: "", address: "", quoteValidityDays: "15", quoteDefaultNotes: "", timezone: "America/Sao_Paulo" };

describe("dados da empresa", () => {
  it("usa padrões quando a empresa não preencheu", async () => {
    const service = createCompanyProfileService({ get: async () => null, upsert: vi.fn() });
    expect((await service.get("co")).quote_validity_days).toBe(15);
  });

  it("só owner e admin editam", async () => {
    const upsert = vi.fn(async () => undefined);
    const service = createCompanyProfileService({ get: async () => null, upsert });
    const input = companyProfileSchema.parse(VALID);
    await expect(service.save({ companyId: "co", role: "member" }, input)).rejects.toMatchObject({ code: "forbidden" });
    await service.save({ companyId: "co", role: "admin" }, input);
    expect(upsert).toHaveBeenCalledOnce();
  });

  it("validade mínima de 1 dia e fuso da lista", () => {
    expect(companyProfileSchema.safeParse({ ...VALID, quoteValidityDays: "0" }).success).toBe(false);
    expect(companyProfileSchema.safeParse({ ...VALID, timezone: "Marte" }).success).toBe(false);
  });
});
