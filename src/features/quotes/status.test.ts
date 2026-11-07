import { describe, expect, it } from "vitest";
import { quoteViewTag, quoteViewText } from "./status";

const TZ = "America/Sao_Paulo";
const once = { first_viewed_at: "2026-11-07T17:32:00Z", last_viewed_at: "2026-11-07T17:32:00Z", view_count: 1 };
const twice = { ...once, last_viewed_at: "2026-11-08T12:10:00Z", view_count: 3 };

describe("abertura do link no escritório", () => {
  it("diz quando o cliente viu e quantas vezes abriu", () => {
    expect(quoteViewText("sent", once, TZ)).toBe("Visto pelo cliente em 07/11/2026 às 14:32.");
    expect(quoteViewText("approved", twice, TZ)).toBe("Visto pelo cliente em 07/11/2026 às 14:32. Abriu 3 vezes, a última em 08/11/2026 às 09:10.");
  });

  it("enviado e nunca aberto avisa; rascunho e outros sem abertura não dizem nada", () => {
    expect(quoteViewText("sent", null, TZ)).toBe("O cliente ainda não abriu o link.");
    expect(quoteViewText("draft", null, TZ)).toBeNull();
    expect(quoteViewText("refused", null, TZ)).toBeNull();
  });

  it("etiqueta da lista só para quem espera resposta", () => {
    expect(quoteViewTag("sent", once, TZ)).toEqual({ label: "Visto em 07/11", seen: true });
    expect(quoteViewTag("sent", null, TZ)).toEqual({ label: "Não aberto", seen: false });
    expect(quoteViewTag("approved", once, TZ)).toBeNull();
  });
});
