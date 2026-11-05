import { describe, expect, it, vi } from "vitest";
import type { QuoteInput } from "@/features/quotes/schemas";
import { closeQuoteSchema, publicResponseSchema, quoteSchema } from "@/features/quotes/schemas";
import type { ActorContext } from "@/server/actor";
import type { QuoteItem } from "@/types/database";
import { createQuoteService, estimateQuoteProfit, type QuoteRepository } from "./quoteService";

const OWNER: ActorContext = { companyId: "co-1", role: "owner" };
const MEMBER: ActorContext = { companyId: "co-1", role: "member" };
const TECHNICIAN: ActorContext = { companyId: "co-1", role: "technician" };

const INPUT: QuoteInput = {
  clientId: null,
  locationId: null,
  title: "",
  validUntil: null,
  discountCents: 0,
  notes: "",
  items: [],
};

function makeRepo() {
  return {
    list: vi.fn(async () => ({ items: [], total: 0, page: 1, pageSize: 20 })),
    listOpen: vi.fn(async () => []),
    countByStatus: vi.fn(async () => ({})),
    countCreatedSince: vi.fn(async () => 0),
    get: vi.fn(async () => null),
    listItems: vi.fn(async () => []),
    listResponses: vi.fn(async () => []),
    getRevenue: vi.fn(async () => null),
    save: vi.fn(async () => "q-1"),
    transition: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
    undoClose: vi.fn(async () => undefined),
    duplicate: vi.fn(async () => "q-2"),
    softDelete: vi.fn(async () => undefined),
  } satisfies QuoteRepository;
}

function makeService(repo = makeRepo(), limit: number | null = null) {
  return createQuoteService({
    repo,
    getMonthlyLimit: async () => limit,
    getMonthStart: async () => "2026-10-01T03:00:00.000Z",
  });
}

const CLOSE = {
  amountCents: 100,
  competenceDate: "2026-10-01",
  installments: [{ amount_cents: 100, due_date: "2026-10-01", method: "pix" as const, received: true }],
};

describe("permissões de orçamento", () => {
  it("técnico não acessa nada", async () => {
    const service = makeService();
    await expect(service.list(TECHNICIAN, {})).rejects.toMatchObject({ code: "forbidden" });
    await expect(service.getDetail(TECHNICIAN, "q")).rejects.toMatchObject({ code: "forbidden" });
    await expect(service.save(TECHNICIAN, null, INPUT)).rejects.toMatchObject({ code: "forbidden" });
    await expect(service.transition(TECHNICIAN, "q", "send")).rejects.toMatchObject({ code: "forbidden" });
  });

  it("member cria e envia, mas não fecha, desfaz nem exclui", async () => {
    const repo = makeRepo();
    const service = makeService(repo);
    await service.save(MEMBER, null, INPUT);
    await service.transition(MEMBER, "q", "send");
    await expect(service.close(MEMBER, "q", CLOSE)).rejects.toMatchObject({ code: "forbidden" });
    await expect(service.undoClose(MEMBER, "q")).rejects.toMatchObject({ code: "forbidden" });
    await expect(service.remove(MEMBER, "q")).rejects.toMatchObject({ code: "forbidden" });
    expect(repo.close).not.toHaveBeenCalled();
    expect(repo.softDelete).not.toHaveBeenCalled();
  });

  it("member não recebe a receita do orçamento", async () => {
    const repo = makeRepo();
    repo.get.mockResolvedValue({ id: "q" } as never);
    await makeService(repo).getDetail(MEMBER, "q");
    expect(repo.getRevenue).not.toHaveBeenCalled();
  });

  it("owner fecha", async () => {
    const repo = makeRepo();
    await makeService(repo).close(OWNER, "q", CLOSE);
    expect(repo.close).toHaveBeenCalledWith("co-1", "q", CLOSE);
  });
});

describe("limite do plano", () => {
  it("bloqueia criar e duplicar acima do limite do mês", async () => {
    const repo = makeRepo();
    repo.countCreatedSince.mockResolvedValue(20);
    const service = makeService(repo, 20);
    await expect(service.save(OWNER, null, INPUT)).rejects.toMatchObject({ code: "conflict" });
    await expect(service.duplicate(OWNER, "q")).rejects.toMatchObject({ code: "conflict" });
    expect(repo.save).not.toHaveBeenCalled();
    expect(repo.duplicate).not.toHaveBeenCalled();
  });

  it("acima do limite, ainda edita rascunhos existentes", async () => {
    const repo = makeRepo();
    repo.countCreatedSince.mockResolvedValue(99);
    await makeService(repo, 20).save(OWNER, "q-1", INPUT);
    expect(repo.save).toHaveBeenCalledOnce();
  });

  it("ilimitado não consulta a contagem", async () => {
    const repo = makeRepo();
    await makeService(repo, null).save(OWNER, null, INPUT);
    expect(repo.countCreatedSince).not.toHaveBeenCalled();
  });
});

describe("custo estimado", () => {
  it("usa o custo atual do catálogo e ignora item avulso", () => {
    const items = [
      { catalog_item_id: "a", pricing_mode: "fixed", quantity: 2, people: 1 },
      { catalog_item_id: null, pricing_mode: "fixed", quantity: 5, people: 1 },
    ] as QuoteItem[];
    expect(estimateQuoteProfit(1000, items, [{ id: "a", cost_cents: 100 }])).toEqual({
      costCents: 200,
      profitCents: 800,
      marginPercent: 80,
    });
  });
});

describe("validação", () => {
  it("recusa item sem descrição ou com quantidade zero", () => {
    const item = { catalogItemId: null, description: "x", unit: "un", pricingMode: "fixed", quantity: 1, people: 1, unitPriceCents: 1 };
    expect(quoteSchema.safeParse({ ...INPUT, items: [item] }).success).toBe(true);
    expect(quoteSchema.safeParse({ ...INPUT, items: [{ ...item, description: " " }] }).success).toBe(false);
    expect(quoteSchema.safeParse({ ...INPUT, items: [{ ...item, quantity: 0 }] }).success).toBe(false);
  });

  it("fechar exige valor positivo e data", () => {
    expect(closeQuoteSchema.safeParse({ ...CLOSE, amountCents: 0 }).success).toBe(false);
    expect(closeQuoteSchema.safeParse({ ...CLOSE, competenceDate: "" }).success).toBe(false);
    expect(closeQuoteSchema.safeParse({ ...CLOSE, amountCents: 1, installments: [{ ...CLOSE.installments[0], amount_cents: 1 }] }).success).toBe(true);
  });

  it("resposta pública exige nome, e motivo na recusa", () => {
    expect(publicResponseSchema.safeParse({ decision: "approved", name: "A", comment: "" }).success).toBe(false);
    expect(publicResponseSchema.safeParse({ decision: "approved", name: "Ana", comment: "" }).success).toBe(true);
    expect(publicResponseSchema.safeParse({ decision: "refused", name: "Ana", comment: "" }).success).toBe(false);
    expect(publicResponseSchema.safeParse({ decision: "refused", name: "Ana", comment: "Caro" }).success).toBe(true);
  });
});
