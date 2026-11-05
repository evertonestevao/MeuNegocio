import { describe, expect, it, vi } from "vitest";
import type { CompanyTax } from "@/types/tax";
import { cardFeesSchema, createTaxService, monthlyRevenuesSchema, taxSettingsSchema } from "./taxService";

const OWNER = { companyId: "co", role: "owner" as const };
const MEMBER = { companyId: "co", role: "member" as const };
const BASE = { taxRegime: "simples", taxMode: "manual", taxRate: "", simplesAnnex: "", activityStartedOn: "" };

describe("configuração do imposto", () => {
  it("alíquota informada em %, guardada em centésimos de ponto", () => {
    expect(taxSettingsSchema.parse({ ...BASE, taxRate: "8,43" })).toMatchObject({ taxRegime: "simples", taxRateBps: 843, taxRateAuto: false });
    expect(taxSettingsSchema.parse({ ...BASE, taxRegime: "other", taxRate: "16.33%" }).taxRateBps).toBe(1633);
  });

  it("automático pelo RBT12 só no Simples, e exige o anexo", () => {
    expect(taxSettingsSchema.safeParse({ ...BASE, taxMode: "auto" }).success).toBe(false);
    expect(taxSettingsSchema.parse({ ...BASE, taxMode: "auto", simplesAnnex: "III" })).toMatchObject({ taxRateAuto: true, simplesAnnex: "III" });
    // Fora do Simples, anexo, Fator R e início de atividade não se aplicam.
    expect(taxSettingsSchema.parse({ ...BASE, taxRegime: "other", taxMode: "auto", simplesAnnex: "V", fatorR: "on", activityStartedOn: "2026-01-10" })).toMatchObject({
      taxRateAuto: false,
      simplesAnnex: null,
      fatorR: false,
      activityStartedOn: null,
    });
  });

  it("Fator R só vale no Anexo V", () => {
    expect(taxSettingsSchema.parse({ ...BASE, taxMode: "auto", simplesAnnex: "V", fatorR: "on" }).fatorR).toBe(true);
    expect(taxSettingsSchema.parse({ ...BASE, taxMode: "auto", simplesAnnex: "III", fatorR: "on" }).fatorR).toBe(false);
  });

  it("sem regime ou no MEI não há percentual por serviço", () => {
    expect(taxSettingsSchema.parse({ ...BASE, taxRegime: "", taxRate: "6" })).toMatchObject({ taxRegime: null, taxRateBps: 0, taxRateAuto: false });
    expect(taxSettingsSchema.parse({ ...BASE, taxRegime: "mei", taxRate: "6" }).taxRateBps).toBe(0);
  });

  it("recusa alíquota fora de 0 a 40% e regime desconhecido", () => {
    expect(taxSettingsSchema.safeParse({ ...BASE, taxRate: "41" }).success).toBe(false);
    expect(taxSettingsSchema.safeParse({ ...BASE, taxRegime: "lucro" }).success).toBe(false);
  });
});

describe("regime de caixa e taxas do cartão", () => {
  it("regime de caixa só no cálculo automático do Simples", () => {
    expect(taxSettingsSchema.parse({ ...BASE, taxMode: "auto", simplesAnnex: "III", cashBasis: "on" }).taxCashBasis).toBe(true);
    expect(taxSettingsSchema.parse({ ...BASE, taxRate: "6", cashBasis: "on" }).taxCashBasis).toBe(false);
  });

  it("taxas em %, de 0 a 20", () => {
    expect(cardFeesSchema.parse({ creditFee: "3,49", debitFee: "" })).toEqual({ creditBps: 349, debitBps: 0 });
    expect(cardFeesSchema.safeParse({ creditFee: "21", debitFee: "1" }).success).toBe(false);
  });
});

describe("faturamento informado", () => {
  it("valor em reais vira centavos; vazio tira o informado", () => {
    expect(
      monthlyRevenuesSchema.parse([
        { month: "2026-10-01", amount: "25.000,00" },
        { month: "2026-09-01", amount: "" },
      ]),
    ).toEqual([
      { month: "2026-10-01", amountCents: 2_500_000 },
      { month: "2026-09-01", amountCents: null },
    ]);
  });

  it("recusa valor inválido e mês fora do primeiro dia", () => {
    expect(monthlyRevenuesSchema.safeParse([{ month: "2026-10-01", amount: "abc" }]).success).toBe(false);
    expect(monthlyRevenuesSchema.safeParse([{ month: "2026-10-15", amount: "10" }]).success).toBe(false);
  });
});

describe("serviço de impostos", () => {
  function setup() {
    const repo = {
      get: vi.fn(async () => ({ rate_bps: 808 }) as CompanyTax),
      saveSettings: vi.fn(async () => undefined),
      saveMonthlyRevenues: vi.fn(async () => undefined),
      saveCardFees: vi.fn(async () => undefined),
    };
    return { repo, service: createTaxService(repo) };
  }

  it("só owner e admin veem e alteram; membro recebe a alíquota como null", async () => {
    const { repo, service } = setup();
    await expect(service.get(MEMBER)).rejects.toMatchObject({ code: "forbidden" });
    await expect(service.saveSettings(MEMBER, taxSettingsSchema.parse(BASE))).rejects.toMatchObject({ code: "forbidden" });
    await expect(service.saveMonthlyRevenues(MEMBER, [{ month: "2026-10-01", amountCents: 1 }])).rejects.toMatchObject({ code: "forbidden" });
    expect(await service.getRate(MEMBER)).toBeNull();
    expect(repo.get).not.toHaveBeenCalled();
    expect(await service.getRate(OWNER)).toBe(808);
  });

  it("lista vazia de meses não chama o banco", async () => {
    const { repo, service } = setup();
    await service.saveMonthlyRevenues(OWNER, []);
    expect(repo.saveMonthlyRevenues).not.toHaveBeenCalled();
  });
});
