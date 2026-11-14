import { describe, expect, it, vi } from "vitest";
import { buildFirstSteps, createFirstStepsService } from "./firstStepsService";

const counts = (catalogItems: number, clients: number, quotes: number) => ({ catalogItems, clients, quotes });
const options = (hasLogo: boolean, dismissed = false) => ({ hasLogo, dismissed });

describe("primeiros passos", () => {
  it("marca o que já foi feito", () => {
    const steps = buildFirstSteps({ hasLogo: true, ...counts(0, 33, 0) });
    expect(steps.map((step) => [step.key, step.done])).toEqual([
      ["logo", true],
      ["catalog", false],
      ["clients", true],
      ["quote", false],
    ]);
  });

  it("mostra os passos enquanto o primeiro orçamento não saiu", async () => {
    const repo = { counts: vi.fn(async () => counts(0, 0, 0)), dismiss: vi.fn() };
    const service = createFirstStepsService(repo);
    expect(await service.get({ companyId: "co", role: "owner" }, options(false))).toHaveLength(4);
  });

  it("some assim que o primeiro orçamento é feito, mesmo sem logo ou clientes", async () => {
    const repo = { counts: vi.fn(async () => counts(0, 0, 1)), dismiss: vi.fn() };
    const service = createFirstStepsService(repo);
    expect(await service.get({ companyId: "co", role: "owner" }, options(false))).toBeNull();
  });

  it("some quando a empresa dispensou, mesmo sem nada feito", async () => {
    const repo = { counts: vi.fn(async () => counts(0, 0, 0)), dismiss: vi.fn() };
    const service = createFirstStepsService(repo);
    expect(await service.get({ companyId: "co", role: "owner" }, options(false, true))).toBeNull();
    // Dispensado nem precisa contar.
    expect(repo.counts).not.toHaveBeenCalled();
  });

  it("não aparece para quem não cuida da empresa", async () => {
    const repo = { counts: vi.fn(async () => counts(0, 0, 0)), dismiss: vi.fn() };
    const service = createFirstStepsService(repo);
    expect(await service.get({ companyId: "co", role: "member" }, options(false))).toBeNull();
  });

  it("dispensa só para owner/admin e grava na empresa", async () => {
    const repo = { counts: vi.fn(async () => counts(0, 0, 0)), dismiss: vi.fn() };
    const service = createFirstStepsService(repo);
    await service.dismiss({ companyId: "co", role: "admin" });
    expect(repo.dismiss).toHaveBeenCalledWith("co");
    await expect(service.dismiss({ companyId: "co", role: "member" })).rejects.toThrow();
  });
});
