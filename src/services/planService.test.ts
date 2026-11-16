import { describe, expect, it, vi } from "vitest";
import type { Plan } from "@/types/database";
import { createPlanService, parseAccessEmails, type PlanInput, type PlanRepository } from "./planService";

const FEATURES: PlanInput["features"] = {
  max_members: 5,
  max_clients: null,
  max_quotes_month: null,
  public_approval: true,
  work_orders: true,
  hours: false,
};

const INPUT: PlanInput = { customText: null, name: "Plus", priceCents: 5000, extraSeatPriceCents: 500, features: FEATURES, paymentMethods: ["credit_card"], trialDays: 7, isPublic: true };

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
});
