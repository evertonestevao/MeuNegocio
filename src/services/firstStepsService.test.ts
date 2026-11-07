import { describe, expect, it, vi } from "vitest";
import { buildFirstSteps, createFirstStepsService } from "./firstStepsService";

const counts = (catalogItems: number, clients: number, quotes: number) => ({ catalogItems, clients, quotes });

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

  it("some quando tudo foi feito e não aparece para quem não cuida da empresa", async () => {
    const repo = { counts: vi.fn(async () => counts(1, 1, 1)) };
    const service = createFirstStepsService(repo);
    expect(await service.get({ companyId: "co", role: "owner" }, true)).toBeNull();
    expect(await service.get({ companyId: "co", role: "owner" }, false)).toHaveLength(4);
    expect(await service.get({ companyId: "co", role: "member" }, false)).toBeNull();
  });
});
