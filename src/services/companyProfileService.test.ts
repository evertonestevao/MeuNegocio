import { describe, expect, it, vi } from "vitest";
import { companyProfileSchema, createCompanyProfileService } from "./companyProfileService";

const VALID = { cnpj: "", phone: "", email: "", address: "", quoteValidityDays: "15", quoteDefaultNotes: "", timezone: "America/Sao_Paulo" };

describe("dados da empresa", () => {
  it("usa padrões quando a empresa não preencheu", async () => {
    const service = createCompanyProfileService({ get: async () => null, getForDocument: async () => null, upsert: vi.fn() });
    expect((await service.get("co")).quote_validity_days).toBe(15);
  });

  it("subconjunto de contato (técnico) usa padrões e não traz dado financeiro", async () => {
    const service = createCompanyProfileService({ get: async () => null, getForDocument: async () => null, upsert: vi.fn() });
    const doc = await service.getForDocument("co");
    expect(doc.timezone).toBe("America/Sao_Paulo");
    expect(doc).not.toHaveProperty("tax_rate_bps");
    expect(doc).not.toHaveProperty("card_fee_credit_bps");
    expect(doc).not.toHaveProperty("target_margin_percent");
  });

  it("só owner e admin editam", async () => {
    const upsert = vi.fn(async () => undefined);
    const service = createCompanyProfileService({ get: async () => null, getForDocument: async () => null, upsert });
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
