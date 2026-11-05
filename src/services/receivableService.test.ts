import { describe, expect, it, vi } from "vitest";
import { createReceivableService, receiveInstallmentSchema, rescheduleInstallmentSchema } from "./receivableService";

const OWNER = { companyId: "co", role: "owner" as const };
const MEMBER = { companyId: "co", role: "member" as const };
const ID = "6b1f4c1e-5d4b-4c8a-9a39-3f6f0e8f7a11";

function setup() {
  const repo = {
    listOpen: vi.fn(async () => []),
    listReceived: vi.fn(async () => []),
    listByQuote: vi.fn(async () => []),
    receive: vi.fn(async () => undefined),
    undoReceive: vi.fn(async () => undefined),
    reschedule: vi.fn(async () => undefined),
  };
  return { repo, service: createReceivableService(repo) };
}

describe("baixa de parcela", () => {
  it("valor em reais, forma opcional e vencimento do restante opcional", () => {
    expect(receiveInstallmentSchema.parse({ id: ID, receivedOn: "2026-11-04", receivedCents: "1.500,00", method: "", restDueDate: "" })).toEqual({
      id: ID,
      receivedOn: "2026-11-04",
      receivedCents: 150_000,
      method: null,
      restDueDate: null,
    });
    expect(receiveInstallmentSchema.safeParse({ id: ID, receivedOn: "2026-11-04", receivedCents: "0" }).success).toBe(false);
    expect(rescheduleInstallmentSchema.safeParse({ id: ID, dueDate: "", method: "pix" }).success).toBe(false);
  });

  it("não aceita recebimento no futuro", async () => {
    const { repo, service } = setup();
    const input = receiveInstallmentSchema.parse({ id: ID, receivedOn: "2026-11-05", receivedCents: "10" });
    await expect(service.receive(OWNER, input, "2026-11-04")).rejects.toMatchObject({ code: "validation_error" });
    expect(repo.receive).not.toHaveBeenCalled();
  });

  it("só owner e admin veem e dão baixa", async () => {
    const { repo, service } = setup();
    const input = receiveInstallmentSchema.parse({ id: ID, receivedOn: "2026-11-04", receivedCents: "10" });
    await expect(service.listOpen(MEMBER)).rejects.toMatchObject({ code: "forbidden" });
    await expect(service.receive(MEMBER, input, "2026-11-04")).rejects.toMatchObject({ code: "forbidden" });
    await expect(service.undoReceive(MEMBER, ID)).rejects.toMatchObject({ code: "forbidden" });
    expect(repo.receive).not.toHaveBeenCalled();
    await service.receive({ companyId: "co", role: "admin" }, input, "2026-11-04");
    expect(repo.receive).toHaveBeenCalledWith("co", input);
  });
});
