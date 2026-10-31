import { describe, expect, it } from "vitest";
import { planOfferLines } from "./planFeatures";

describe("oferta do plano", () => {
  it("mostra limites e omite recurso que o plano não tem", () => {
    expect(
      planOfferLines({ max_members: 2, max_clients: 30, max_quotes_month: 1, public_approval: false, work_orders: true, hours: false, audit_retention_days: 7 }),
    ).toEqual(["Até 2 membros inclusos", "Até 30 clientes", "Até 1 orçamento por mês", "Ordem de serviço"]);
  });

  it("limite vazio é ilimitado", () => {
    expect(planOfferLines({ max_clients: null })).toContain("Clientes ilimitados");
  });
});
