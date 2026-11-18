import { describe, expect, it, vi } from "vitest";
import type { Plan, PlanUsage } from "@/types/database";
import { createPlanService, describeDeletionBlock, isSystemPlan, parseAccessEmails, type PlanInput, type PlanRepository } from "./planService";

const FEATURES: PlanInput["features"] = {
  max_members: 5,
  max_clients: null,
  max_quotes_month: null,
  public_approval: true,
  work_orders: true,
  hours: false,
};

const INPUT: PlanInput = { customText: null, name: "Plus", priceCents: 5000, extraSeatPriceCents: 500, features: FEATURES, paymentMethods: ["credit_card"], trialDays: 7, isPublic: true, billingInterval: "month", termPayments: 12 };

function makePlan(overrides: Partial<Plan> = {}): Plan {
  return {
    id: "p1",
    code: "plus",
    name: "Plus",
    price_cents: 5000,
    currency: "BRL",
    billing_interval: "month",
    features: FEATURES,
    custom_text: null,
    extra_seat_price_cents: 500,
    payment_methods: ["credit_card"],
    trial_days: 7,
    is_public: true,
    term_payments: 12,
    is_active: true,
    deleted_at: null,
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

function makeRepo(plan: Plan | null = makePlan()) {
  return {
    list: vi.fn(async () => (plan ? [plan] : [])),
    getById: vi.fn(async () => plan),
    getByCode: vi.fn(async () => null as Plan | null),
    save: vi.fn(async () => makePlan()),
    setActive: vi.fn(async () => makePlan()),
    listAudit: vi.fn(async () => []),
    listUsage: vi.fn(async () => [] as PlanUsage[]),
    remove: vi.fn(async () => makePlan()),
    listAccess: vi.fn(async () => []),
    setAccess: vi.fn(async ({ emails }: { emails: string[] }) => emails),
  } satisfies PlanRepository;
}

describe("planService", () => {
  it("a oferta pública traz só planos ativos", async () => {
    const repo = makeRepo();
    repo.list.mockResolvedValue([makePlan(), makePlan({ id: "p2", is_active: false })]);
    expect((await createPlanService(repo).listActive()).map((plan) => plan.id)).toEqual(["p1"]);
  });

  it("cria plano novo com quem alterou", async () => {
    const repo = makeRepo(null);
    await createPlanService(repo).create("plus", INPUT, "admin-1");
    expect(repo.save).toHaveBeenCalledWith({ planId: null, code: "plus", input: INPUT, actorId: "admin-1" });
  });

  it("recusa código repetido", async () => {
    const repo = makeRepo();
    repo.getByCode.mockResolvedValue(makePlan());
    await expect(createPlanService(repo).create("plus", INPUT, "a")).rejects.toMatchObject({ code: "conflict" });
    expect(repo.save).not.toHaveBeenCalled();
  });

  it("editar mantém o code do plano", async () => {
    const repo = makeRepo();
    await createPlanService(repo).update("p1", INPUT, "a");
    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ planId: "p1", code: "plus" }));
  });

  it("recusa chave fora da lista fechada", async () => {
    const service = createPlanService(makeRepo());
    await expect(
      service.update("p1", { ...INPUT, features: { ...FEATURES, inventada: true } }, "a"),
    ).rejects.toMatchObject({ code: "validation_error" });
  });

  it("recusa tipo errado e chave faltando", async () => {
    const service = createPlanService(makeRepo());
    await expect(
      service.update("p1", { ...INPUT, features: { ...FEATURES, hours: 1 } }, "a"),
    ).rejects.toMatchObject({ code: "validation_error" });
    await expect(
      service.update("p1", { ...INPUT, features: { ...FEATURES, max_clients: -1 } }, "a"),
    ).rejects.toMatchObject({ code: "validation_error" });
    const missing = Object.fromEntries(Object.entries(FEATURES).filter(([key]) => key !== "hours"));
    await expect(service.update("p1", { ...INPUT, features: missing }, "a")).rejects.toMatchObject({
      code: "validation_error",
    });
  });

  it("recusa sem meio de pagamento, meio inválido ou dias de teste fora de 0..90", async () => {
    const service = createPlanService(makeRepo());
    await expect(service.update("p1", { ...INPUT, paymentMethods: [] }, "a")).rejects.toMatchObject({ code: "validation_error" });
    await expect(service.update("p1", { ...INPUT, paymentMethods: ["crypto"] }, "a")).rejects.toMatchObject({ code: "validation_error" });
    await expect(service.update("p1", { ...INPUT, trialDays: -1 }, "a")).rejects.toMatchObject({ code: "validation_error" });
    await expect(service.update("p1", { ...INPUT, trialDays: 120 }, "a")).rejects.toMatchObject({ code: "validation_error" });
  });

  it("o plano padrão não pode ser cobrado nem desativado", async () => {
    const service = createPlanService(makeRepo(makePlan({ code: "free" })));
    await expect(service.update("p1", INPUT, "a")).rejects.toMatchObject({ code: "validation_error" });
    await expect(service.setActive("p1", false, "a")).rejects.toMatchObject({ code: "validation_error" });
  });

  it("desativa outros planos e registra quem alterou", async () => {
    const repo = makeRepo();
    await createPlanService(repo).setActive("p1", false, "a");
    expect(repo.setActive).toHaveBeenCalledWith({ planId: "p1", isActive: false, actorId: "a" });
  });

  it("plano inexistente devolve not_found", async () => {
    const service = createPlanService(makeRepo(null));
    await expect(service.update("x", INPUT, "a")).rejects.toMatchObject({ code: "not_found" });
    await expect(service.setActive("x", true, "a")).rejects.toMatchObject({ code: "not_found" });
  });

  it("a oferta pública não traz plano privado, mas o painel enxerga todos os ativos", async () => {
    const repo = makeRepo();
    repo.list.mockResolvedValue([makePlan(), makePlan({ id: "p2", is_public: false })]);
    const service = createPlanService(repo);
    expect((await service.listPublicActive()).map((plan) => plan.id)).toEqual(["p1"]);
    expect((await service.listActive()).map((plan) => plan.id)).toEqual(["p1", "p2"]);
  });

  it("o plano padrão não pode ser privado", async () => {
    const service = createPlanService(makeRepo(makePlan({ code: "free" })));
    await expect(service.update("p1", { ...INPUT, priceCents: 0, extraSeatPriceCents: 0, isPublic: false }, "a")).rejects.toMatchObject({
      code: "validation_error",
    });
  });

  it("plano de preço zero (piloto) só pode ser privado, mensal e sem membro extra", async () => {
    const pilot: PlanInput = { ...INPUT, priceCents: 0, extraSeatPriceCents: 0, isPublic: false };
    const service = createPlanService(makeRepo(null));
    await expect(service.create("piloto", pilot, "a")).resolves.toBeDefined();
    await expect(service.create("gratis", { ...pilot, isPublic: true }, "a")).rejects.toMatchObject({ code: "validation_error", message: expect.stringContaining("privado") });
    await expect(service.create("piloto2", { ...pilot, billingInterval: "year" }, "a")).rejects.toMatchObject({ code: "validation_error", message: expect.stringContaining("mensal") });
    await expect(service.create("piloto3", { ...pilot, extraSeatPriceCents: 500 }, "a")).rejects.toMatchObject({ code: "validation_error", message: expect.stringContaining("membro extra") });
  });

  it("libera e-mails só em plano privado, normalizados e sem repetir", async () => {
    const repo = makeRepo(makePlan({ is_public: false }));
    await createPlanService(repo).grantAccess("p1", "Amigo@Exemplo.com, amigo@exemplo.com\noutro@exemplo.com", "admin-1");
    expect(repo.setAccess).toHaveBeenCalledWith({
      planId: "p1",
      emails: ["amigo@exemplo.com", "outro@exemplo.com"],
      grant: true,
      actorId: "admin-1",
    });
  });

  it("recusa liberar e-mail em plano público ou inexistente", async () => {
    const publicRepo = makeRepo();
    await expect(createPlanService(publicRepo).grantAccess("p1", "a@b.com", "a")).rejects.toMatchObject({ code: "validation_error" });
    expect(publicRepo.setAccess).not.toHaveBeenCalled();
    await expect(createPlanService(makeRepo(null)).grantAccess("x", "a@b.com", "a")).rejects.toMatchObject({ code: "not_found" });
  });

  it("remover da lista chama o repositório com grant falso", async () => {
    const repo = makeRepo(makePlan({ is_public: false }));
    await createPlanService(repo).revokeAccess("p1", "Amigo@exemplo.com", "admin-1");
    expect(repo.setAccess).toHaveBeenCalledWith({ planId: "p1", emails: ["amigo@exemplo.com"], grant: false, actorId: "admin-1" });
  });

  it("parseAccessEmails recusa vazio, e-mail inválido e lista grande demais", () => {
    expect(() => parseAccessEmails("  ")).toThrow();
    expect(() => parseAccessEmails("ok@a.com, sem-arroba")).toThrow(/sem-arroba/);
    const many = Array.from({ length: 201 }, (_, index) => `u${index}@a.com`).join(" ");
    expect(() => parseAccessEmails(many)).toThrow();
  });

  describe("excluir plano", () => {
    const usage = (overrides: Partial<PlanUsage> = {}): PlanUsage => ({ plan_id: "p1", subscribers: 0, reseller_links: 0, commission_rules: 0, ...overrides });

    it("exclui o plano que ninguém usa, registrando quem excluiu", async () => {
      const repo = makeRepo(makePlan({ code: "plus" }));
      repo.listUsage.mockResolvedValue([usage()]);
      await createPlanService(repo).remove("p1", "admin-1");
      expect(repo.remove).toHaveBeenCalledWith({ planId: "p1", actorId: "admin-1" });
    });

    it("plano sem nenhuma linha de uso (nunca usado) também pode ser excluído", async () => {
      const repo = makeRepo(makePlan({ code: "plus" }));
      await createPlanService(repo).remove("p1", "a");
      expect(repo.remove).toHaveBeenCalled();
    });

    it("recusa plano em uso por empresa, com a quantidade, e não chama o banco", async () => {
      const repo = makeRepo(makePlan({ code: "plus" }));
      repo.listUsage.mockResolvedValue([usage({ subscribers: 3 })]);
      await expect(createPlanService(repo).remove("p1", "a")).rejects.toMatchObject({ code: "conflict", message: expect.stringContaining("Em uso por 3 empresas") });
      expect(repo.remove).not.toHaveBeenCalled();
    });

    it("recusa plano com vínculo de vendedor ou regra de comissão", async () => {
      for (const extra of [{ reseller_links: 1 }, { commission_rules: 2 }]) {
        const repo = makeRepo(makePlan({ code: "plus" }));
        repo.listUsage.mockResolvedValue([usage(extra)]);
        await expect(createPlanService(repo).remove("p1", "a")).rejects.toMatchObject({ code: "conflict", message: expect.stringContaining("comissão") });
        expect(repo.remove).not.toHaveBeenCalled();
      }
    });

    it("o uso é de cada plano: outro plano em uso não trava este", async () => {
      const repo = makeRepo(makePlan({ code: "plus" }));
      repo.listUsage.mockResolvedValue([usage({ plan_id: "outro", subscribers: 9 })]);
      await createPlanService(repo).remove("p1", "a");
      expect(repo.remove).toHaveBeenCalled();
    });

    it("plano do sistema nunca se exclui, mesmo sem uso", async () => {
      for (const code of ["free", "pro"]) {
        const repo = makeRepo(makePlan({ code }));
        await expect(createPlanService(repo).remove("p1", "a")).rejects.toMatchObject({ code: "validation_error", message: expect.stringContaining("sistema") });
        expect(repo.remove).not.toHaveBeenCalled();
      }
    });

    it("plano inexistente devolve not_found", async () => {
      await expect(createPlanService(makeRepo(null)).remove("x", "a")).rejects.toMatchObject({ code: "not_found" });
    });

    it("a mensagem do bloqueio: singular, plural e sem bloqueio", () => {
      expect(describeDeletionBlock("plus", usage({ subscribers: 1 }))).toContain("Em uso por 1 empresa.");
      expect(describeDeletionBlock("plus", usage({ subscribers: 2 }))).toContain("Em uso por 2 empresas.");
      expect(describeDeletionBlock("plus", usage())).toBeNull();
      expect(describeDeletionBlock("plus", undefined)).toBeNull();
    });

    it("quem é plano do sistema", () => {
      expect(isSystemPlan("free")).toBe(true);
      expect(isSystemPlan("pro")).toBe(true);
      expect(isSystemPlan("anual")).toBe(false);
    });
  });

  describe("tipo de cobrança e parcelas do ciclo", () => {
    const annual = (overrides: Partial<PlanInput> = {}): PlanInput => ({ ...INPUT, priceCents: 395880, extraSeatPriceCents: 0, billingInterval: "year", termPayments: 12, ...overrides });

    it("cria plano anual com o número de parcelas escolhido", async () => {
      const repo = makeRepo(null);
      await createPlanService(repo).create("anual_teste", annual({ priceCents: 1500, termPayments: 3 }), "a");
      expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ input: expect.objectContaining({ billingInterval: "year", termPayments: 3 }) }));
    });

    it("aceita de 1 a 12 parcelas e recusa fora disso", async () => {
      const service = createPlanService(makeRepo(null));
      await expect(service.create("a1", annual({ priceCents: 500, termPayments: 1 }), "a")).resolves.toBeDefined();
      await expect(service.create("a12", annual(), "a")).resolves.toBeDefined();
      for (const termPayments of [0, 13, -1, 2.5]) {
        await expect(service.create("x", annual({ termPayments }), "a")).rejects.toMatchObject({ code: "validation_error", message: expect.stringContaining("1 a 12") });
      }
    });

    it("cada parcela precisa ter pelo menos R$ 5,00, o mínimo do Asaas", async () => {
      const service = createPlanService(makeRepo(null));
      await expect(service.create("x", annual({ priceCents: 1490, termPayments: 3 }), "a")).rejects.toMatchObject({ message: expect.stringContaining("pelo menos R$") });
      await expect(service.create("y", annual({ priceCents: 1500, termPayments: 3 }), "a")).resolves.toBeDefined();
      await expect(service.create("z", annual({ priceCents: 499, termPayments: 1 }), "a")).rejects.toMatchObject({ code: "validation_error" });
    });

    it("anual não vende membro extra", async () => {
      await expect(createPlanService(makeRepo(null)).create("x", annual({ extraSeatPriceCents: 500 }), "a")).rejects.toMatchObject({ message: expect.stringContaining("membro extra") });
    });

    it("tipo de cobrança inválido é recusado, e o plano padrão só pode ser mensal", async () => {
      await expect(createPlanService(makeRepo(null)).create("x", { ...INPUT, billingInterval: "week" as never }, "a")).rejects.toMatchObject({ code: "validation_error" });
      const free = createPlanService(makeRepo(makePlan({ code: "free" })));
      await expect(free.update("p1", { ...INPUT, priceCents: 0, extraSeatPriceCents: 0 }, "a")).resolves.toBeDefined();
      await expect(createPlanService(makeRepo(null)).create("free", { ...INPUT, priceCents: 0, extraSeatPriceCents: 0, billingInterval: "year" }, "a")).rejects.toMatchObject({ message: expect.stringContaining("mensal") });
    });

    it("editar não muda o tipo de cobrança nem as parcelas: valem os do plano", async () => {
      const repo = makeRepo(makePlan({ billing_interval: "year", term_payments: 3, price_cents: 1500, extra_seat_price_cents: 0 }));
      await createPlanService(repo).update("p1", annual({ priceCents: 3000, termPayments: 12, billingInterval: "month" }), "a");
      expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ planId: "p1", input: expect.objectContaining({ billingInterval: "year", termPayments: 3, priceCents: 3000 }) }));
    });

    it("editar o preço respeita o mínimo por parcela do plano que já existe", async () => {
      const repo = makeRepo(makePlan({ billing_interval: "year", term_payments: 3, price_cents: 1500, extra_seat_price_cents: 0 }));
      await expect(createPlanService(repo).update("p1", annual({ priceCents: 1000 }), "a")).rejects.toMatchObject({ message: expect.stringContaining("pelo menos R$") });
    });
  });
});
