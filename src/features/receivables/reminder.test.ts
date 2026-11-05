import { describe, expect, it } from "vitest";
import type { Receivable } from "@/types/finance";
import { reminderText } from "./reminder";

const item = { amount_cents: 40_000, due_date: "2026-10-25", quote_number: 10, quote_title: "Instalação de VRF", contact_name: "Dr. Paulo Reis", received_on: null } as Receivable;

describe("lembrete de cobrança", () => {
  it("cumprimenta pelo nome e diz se venceu ou vai vencer", () => {
    const overdue = reminderText(item, "Refrigeração Exemplo", "2026-11-04").replace(/\u00a0/g, " ");
    expect(overdue).toContain("Olá, Dr. Paulo!");
    expect(overdue).toContain("parcela de R$ 400,00 do orçamento Nº 0010 (Instalação de VRF), que venceu em 25/10/2026");
    expect(reminderText({ ...item, due_date: "2026-11-04" }, "Empresa", "2026-11-04")).toContain("que vence hoje");
    expect(reminderText({ ...item, contact_name: null }, "Empresa", "2026-11-01")).toMatch(/^Olá! Aqui é da Empresa\./);
  });
});
