import { describe, expect, it } from "vitest";
import type { AuditLog } from "@/types/database";
import {
  createAuditService,
  sanitizeMetadata,
  type AuditRepository,
  type NewAuditEntry,
} from "./auditService";

const COMPANY_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";

function makeRepo(inserted: NewAuditEntry[]): AuditRepository {
  return {
    async insert(entry) {
      inserted.push(entry);
    },
    async listByCompany() {
      return { items: [] as AuditLog[], total: 0 };
    },
    async describeEntities() {
      return {};
    },
  };
}

describe("sanitizeMetadata", () => {
  it("remove chaves sensíveis em qualquer nível", () => {
    expect(
      sanitizeMetadata({
        plan: "pro",
        password: "x",
        api_key: "x",
        Authorization: "Bearer x",
        card_number: "4242",
        nested: { token: "x", ok: 1, deep: { cvv: "123", keep: true } },
      }),
    ).toEqual({ plan: "pro", nested: { ok: 1, deep: { keep: true } } });
  });

  it("preserva metadata sem chaves sensíveis", () => {
    const meta = { entity: "member", role: "admin", count: 3 };
    expect(sanitizeMetadata(meta)).toEqual(meta);
  });

  it("preserva os metadata dos eventos da auditoria completa (fase 3)", () => {
    // shapes reais gravados pelas actions — nenhum deve ser mutilado
    const shapes: Record<string, unknown>[] = [
      { previous_role: "member", new_role: "admin" }, // member.role_changed
      { removed_role: "member" }, // member.removed
      { name: "Empresa Renomeada" }, // company.updated
      { plan_id: "plan-pro", gateway: "stripe" }, // subscription.*
    ];
    for (const shape of shapes) {
      expect(sanitizeMetadata(shape)).toEqual(shape);
    }
  });

  it("segue removendo chave sensível mesmo nos novos eventos", () => {
    expect(
      sanitizeMetadata({ plan_id: "p", gateway: "stripe", card_last4: "4242" }),
    ).toEqual({ plan_id: "p", gateway: "stripe" });
  });
});

describe("auditService.record", () => {
  it("grava entrada válida com metadata sanitizado", async () => {
    const inserted: NewAuditEntry[] = [];
    const service = createAuditService(makeRepo(inserted));
    await service.record({
      companyId: COMPANY_ID,
      userId: USER_ID,
      action: "member.invited",
      metadata: { email_domain: "test.com", token: "secreto" },
    });
    expect(inserted).toHaveLength(1);
    expect(inserted[0].action).toBe("member.invited");
    expect(inserted[0].metadata).toEqual({ email_domain: "test.com" });
  });

  it("aceita userId null para eventos de sistema", async () => {
    const inserted: NewAuditEntry[] = [];
    const service = createAuditService(makeRepo(inserted));
    await service.record({
      companyId: COMPANY_ID,
      userId: null,
      action: "subscription.activated",
    });
    expect(inserted[0].userId).toBeNull();
  });

  it("rejeita companyId inválido e action vazia", async () => {
    const service = createAuditService(makeRepo([]));
    await expect(
      service.record({ companyId: "não-é-uuid", userId: null, action: "x" }),
    ).rejects.toMatchObject({ code: "validation_error" });
    await expect(
      service.record({ companyId: COMPANY_ID, userId: null, action: "" }),
    ).rejects.toMatchObject({ code: "validation_error" });
  });
});

describe("listRecent", () => {
  it("traz o nome do registro citado e só consulta os tipos que sabe descrever", async () => {
    const log = (id: string, entity_type: string | null, entity_id: string | null) =>
      ({ id, company_id: COMPANY_ID, user_id: USER_ID, action: "x", entity_type, entity_id, metadata: {}, created_at: "2026-11-06T20:00:00Z" }) as AuditLog;
    const asked: { entityType: string; entityId: string }[][] = [];
    const service = createAuditService({
      async insert() {},
      async listByCompany() {
        return { items: [log("1", "quote", "q1"), log("2", "client", null), log("3", "subscription", "s1")], total: 3 };
      },
      async describeEntities(_companyId, refs) {
        asked.push(refs);
        return { "quote:q1": "Nº 0008 · Câmeras" };
      },
    });
    const page = await service.listRecent(COMPANY_ID);
    expect(page.items.map((item) => item.entity_name)).toEqual(["Nº 0008 · Câmeras", null, null]);
    expect(asked).toEqual([[{ entityType: "quote", entityId: "q1" }]]);
  });
});
