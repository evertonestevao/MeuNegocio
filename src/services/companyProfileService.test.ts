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

describe("imposto da empresa", () => {
  it("guarda a alíquota em centésimos de ponto, com vírgula ou ponto", () => {
    expect(companyProfileSchema.parse({ ...VALID, taxRegime: "simples", taxRate: "8,43" })).toMatchObject({ taxRegime: "simples", taxRateBps: 843 });
    expect(companyProfileSchema.parse({ ...VALID, taxRegime: "other", taxRate: "16.33%" }).taxRateBps).toBe(1633);
  });

  it("sem regime ou no MEI não há percentual por serviço", () => {
    expect(companyProfileSchema.parse(VALID)).toMatchObject({ taxRegime: null, taxRateBps: 0 });
    expect(companyProfileSchema.parse({ ...VALID, taxRegime: "mei", taxRate: "6" }).taxRateBps).toBe(0);
  });

  it("recusa alíquota fora de 0 a 40% ou com mais de duas casas", () => {
    expect(companyProfileSchema.safeParse({ ...VALID, taxRegime: "simples", taxRate: "41" }).success).toBe(false);
    expect(companyProfileSchema.safeParse({ ...VALID, taxRegime: "simples", taxRate: "8,431" }).success).toBe(false);
    expect(companyProfileSchema.safeParse({ ...VALID, taxRegime: "lucro", taxRate: "8" }).success).toBe(false);
  });
});
