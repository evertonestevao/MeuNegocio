import { describe, expect, it } from "vitest";
import type { ServiceCost } from "@/services/serviceCostService";
import { marginHint } from "./labels";

const cost = (patch: Partial<ServiceCost>) =>
  ({ marginPercent: 86, plannedMarginPercent: 86, expenseCents: 0, laborCents: 0, status: "good", ...patch }) as ServiceCost;

describe("dica da margem do serviço", () => {
  it("sem nada lançado, não chama de margem os 100% de quem ainda não gastou", () => {
    expect(marginHint(cost({ marginPercent: 100 }), 20)).toBe("Nenhum gasto ou hora lançado ainda · prevista 86% · meta 20%");
  });

  it("com custos, separa a realizada da prevista", () => {
    expect(marginHint(cost({ marginPercent: 40, expenseCents: 1 }), 20)).toBe("Margem realizada 40% · prevista 86% · meta 20%");
    expect(marginHint(cost({ marginPercent: 10, expenseCents: 1, status: "low" }), 20)).toBe("Margem realizada 10%, abaixo da meta de 20% · prevista 86%");
    expect(marginHint(cost({ marginPercent: 40, expenseCents: 1, plannedMarginPercent: null }), 20)).toBe("Margem realizada 40% · meta 20%");
  });
});
