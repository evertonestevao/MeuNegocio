import { describe, expect, it } from "vitest";
import { quoteHistoryLine } from "./history";

const TZ = "America/Sao_Paulo";
const entry = (action: string, metadata = {}, user_name: string | null = "Carlos Eduardo Ferreira") => ({
  action,
  created_at: "2026-11-07T17:32:00Z",
  user_name,
  metadata,
});

describe("histórico do orçamento", () => {
  it("aprovação registrada pelo escritório diz quem autorizou e quem registrou", () => {
    expect(quoteHistoryLine(entry("quote.approve", { requested_by: "Osvaldo (síndico)", note: "Por telefone" }), TZ)).toEqual({
      title: "Orçamento aprovado",
      at: "07/11/2026 às 14:32",
      by: "Por Carlos Eduardo Ferreira",
      requestedBy: "Quem autorizou: Osvaldo (síndico)",
      note: "Observação: Por telefone",
    });
  });

  it("cancelamento traz quem pediu e o motivo", () => {
    const line = quoteHistoryLine(entry("quote.cancel", { requested_by: "Ana", note: "Vai fazer depois" }), TZ);
    expect([line.title, line.requestedBy, line.note]).toEqual(["Orçamento cancelado", "Quem pediu o cancelamento: Ana", "Motivo: Vai fazer depois"]);
  });

  it("resposta pelo link e vencimento automático dizem de onde vieram", () => {
    expect(quoteHistoryLine(entry("quote.approved_by_client", { requested_by: "Osvaldo" }, null), TZ).by).toBe("Pelo cliente, no link");
    expect(quoteHistoryLine(entry("quote.expire", { automatic: true }, null), TZ).by).toBe("Pelo sistema, ao vencer a validade");
    expect(quoteHistoryLine(entry("quote.send"), TZ)).toMatchObject({ title: "Orçamento enviado", requestedBy: null, note: null });
  });
});
