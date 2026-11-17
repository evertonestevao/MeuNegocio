import { describe, expect, it, vi } from "vitest";
import type { ReceiptData } from "@/types/finance";
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
    getReceipt: vi.fn(async (_companyId: string, id: string) => (id === "recebida" ? ({ receivedCents: 100 } as ReceiptData) : null)),
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
      anticipationBps: null,
      anticipationCents: null,
    });
    expect(receiveInstallmentSchema.safeParse({ id: ID, receivedOn: "2026-11-04", receivedCents: "0" }).success).toBe(false);
    expect(rescheduleInstallmentSchema.safeParse({ id: ID, dueDate: "", method: "pix" }).success).toBe(false);
  });

  it("antecipação do banco: em % vira centésimos de ponto, em reais vira centavos, vazio é ignorado", () => {
    const base = { id: ID, receivedOn: "2026-11-04", receivedCents: "9.700,00" };
    expect(receiveInstallmentSchema.parse({ ...base, anticipationMode: "percent", anticipationValue: "3,5" })).toMatchObject({ anticipationBps: 350, anticipationCents: null });
    expect(receiveInstallmentSchema.parse({ ...base, anticipationMode: "amount", anticipationValue: "300,00" })).toMatchObject({ anticipationBps: null, anticipationCents: 30_000 });
    // Modo escolhido, mas sem valor: o dono desistiu, a baixa segue normal.
    expect(receiveInstallmentSchema.parse({ ...base, anticipationMode: "percent", anticipationValue: "  " })).toMatchObject({ anticipationBps: null, anticipationCents: null });
    expect(receiveInstallmentSchema.parse(base)).toMatchObject({ anticipationBps: null, anticipationCents: null });
  });

  it("recusa antecipação com valor inválido", () => {
    const base = { id: ID, receivedOn: "2026-11-04", receivedCents: "100" };
    for (const [mode, value] of [["percent", "abc"], ["percent", "0"], ["percent", "50,01"], ["percent", "120"], ["amount", "0"], ["amount", "abc"]]) {
      expect(receiveInstallmentSchema.safeParse({ ...base, anticipationMode: mode, anticipationValue: value }).success, `${mode} ${value}`).toBe(false);
    }
    expect(receiveInstallmentSchema.safeParse({ ...base, anticipationMode: "outro", anticipationValue: "2" }).success).toBe(false);
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

describe("recibo", () => {
  it("só de parcela recebida, e só para quem vê o financeiro", async () => {
    const { service } = setup();
    expect(await service.getReceipt(OWNER, "recebida")).toMatchObject({ receivedCents: 100 });
    await expect(service.getReceipt(OWNER, "a-receber")).rejects.toMatchObject({ code: "not_found" });
    await expect(service.getReceipt(MEMBER, "recebida")).rejects.toMatchObject({ code: "forbidden" });
  });
});
