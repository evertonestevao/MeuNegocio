import { describe, expect, it } from "vitest";
import type { ServiceCost } from "@/services/serviceCostService";
import { marginHint } from "./labels";

const cost = (patch: Partial<ServiceCost>) =>
  ({ marginPercent: 86, plannedMarginPercent: 86, expenseCents: 0, laborCents: 0, status: "good", ...patch }) as ServiceCost;

describe("dica da margem do serviço", () => {
  it("sem nada lançado, deixa claro que é estimativa, sem chamar de resultado real", () => {
    expect(marginHint(cost({ marginPercent: 100 }), 20)).toBe("Ainda nada gasto — é estimativa. Pela estimativa, sobra 86% do valor. Meta: 20%.");
  });

  it("com custos, mostra o quanto sobra de verdade e compara com a meta", () => {
    expect(marginHint(cost({ marginPercent: 40, expenseCents: 1 }), 20)).toBe("Sobra 40% do valor. Meta: 20%.");
    expect(marginHint(cost({ marginPercent: 10, expenseCents: 1, status: "low" }), 20)).toBe("Sobra 10% do valor — abaixo da meta de 20%.");
    expect(marginHint(cost({ marginPercent: 40, expenseCents: 1, plannedMarginPercent: null }), 20)).toBe("Sobra 40% do valor. Meta: 20%.");
  });
});
