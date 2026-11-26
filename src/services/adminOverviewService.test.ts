import { describe, expect, it } from "vitest";
import type { AdminOverviewRaw } from "@/types/adminOverview";
import { buildOverview, churnPercent, createAdminOverviewService, periodDelta } from "./adminOverviewService";

const RAW: AdminOverviewRaw = {
  generated_at: "2026-11-17T12:00:00Z",
  mrr_cents: 1_250_000,
  active_subscribers: 9,
  past_due: 2,
  trialing: 5,
  trials_ending_7d: 3,
  new_companies: { current: 8, previous: 5 },
  canceled: { current: 1, previous: 2 },
  suspended_companies: 1,
  abuse_reports_7d: 2,
  stuck_signups: 4,
  reseller_failures: null,
};

const tile = (key: string, raw = RAW) => buildOverview(raw).tiles.find((item) => item.key === key)!;
const nbsp = (text: string) => text.replace(/\s/g, " ");

describe("taxa de cancelamento", () => {
  it("cancelados sobre (ativos + cancelados), com uma casa", () => {
    expect(churnPercent(1, 9)).toBe(10);
    expect(churnPercent(1, 12)).toBe(7.7);
  });
  it("sem base, não inventa um número", () => {
    expect(churnPercent(0, 0)).toBeNull();
  });
});

describe("diferença entre períodos", () => {
  it("subir é bom ou ruim conforme o indicador", () => {
    expect(periodDelta(8, 5, true)).toMatchObject({ change: "+3", tone: "good" });
    expect(periodDelta(3, 1, false)).toMatchObject({ change: "+2", tone: "bad" });
    expect(periodDelta(1, 2, false)).toMatchObject({ change: "−1", tone: "good" });
    expect(periodDelta(0, 3, true)).toMatchObject({ change: "−3", tone: "bad" });
  });
  it("a seta acompanha o sentido do número, não se é bom: cair em cancelamentos aponta para baixo", () => {
    expect(periodDelta(1, 2, false)).toMatchObject({ direction: "down", tone: "good" });
    expect(periodDelta(8, 5, true)).toMatchObject({ direction: "up", tone: "good" });
    expect(periodDelta(3, 1, false)).toMatchObject({ direction: "up", tone: "bad" });
    expect(periodDelta(4, 4, true)).toMatchObject({ direction: "flat", tone: "neutral" });
  });
  it("sem mudança, neutro; a referência diz com o que compara", () => {
    expect(periodDelta(4, 4, true)).toMatchObject({ change: "0", tone: "neutral" });
    expect(periodDelta(8, 5, true).reference).toBe("vs. 5 nos 30 dias anteriores");
  });
});

describe("indicadores", () => {
  it("traz os seis, na ordem da tela", () => {
    expect(buildOverview(RAW).tiles.map((item) => item.key)).toEqual(["mrr", "subscribers", "trialing", "newCompanies", "canceled", "pastDue"]);
  });
  it("receita em reais e legível", () => {
    expect(nbsp(tile("mrr").value)).toBe("R$ 12.500,00");
  });
  it("testes que terminam: singular e plural", () => {
    expect(tile("trialing").hint).toBe("3 terminam em até 7 dias");
    expect(tile("trialing", { ...RAW, trials_ending_7d: 1 }).hint).toBe("1 termina em até 7 dias");
    expect(tile("trialing", { ...RAW, trials_ending_7d: 0 }).hint).toBe("Nenhum termina nos próximos 7 dias");
  });
  it("cancelamentos mostram a taxa com vírgula e o tom pelo sentido da mudança", () => {
    const canceled = tile("canceled");
    expect(canceled.hint).toBe("Taxa de cancelamento: 10%");
    expect(canceled.delta).toMatchObject({ change: "−1", tone: "good" });
    expect(tile("canceled", { ...RAW, canceled: { current: 1, previous: 0 }, active_subscribers: 12 }).hint).toBe("Taxa de cancelamento: 7,7%");
  });
  it("atraso destaca o indicador só quando existe", () => {
    expect(tile("pastDue").alert).toBe(true);
    expect(tile("pastDue", { ...RAW, past_due: 0 }).alert).toBe(false);
  });
  it("sem assinantes, diz isso em vez de zero seco", () => {
    expect(tile("subscribers", { ...RAW, active_subscribers: 0 }).hint).toBe("Ninguém assinando ainda.");
  });
});

describe("precisa da sua atenção", () => {
  it("só o que tem algo a fazer, do mais grave ao menos grave", () => {
    const items = buildOverview(RAW).attention;
    expect(items.map((item) => item.key)).toEqual(["past-due", "suspended", "abuse", "trials-ending", "stuck-signups"]);
    expect(items.map((item) => item.tone)).toEqual(["critical", "warning", "warning", "info", "info"]);
  });
  it("cada item leva à tela certa", () => {
    const byKey = Object.fromEntries(buildOverview(RAW).attention.map((item) => [item.key, item.href]));
    expect(byKey).toMatchObject({ "past-due": "/admin/empresas?filtro=em-atraso", abuse: "/admin/denuncias", "stuck-signups": "/admin/cadastros" });
  });
  it("tudo zerado: lista vazia", () => {
    const zero = { ...RAW, past_due: 0, suspended_companies: 0, abuse_reports_7d: 0, trials_ending_7d: 0, stuck_signups: 0 };
    expect(buildOverview(zero).attention).toEqual([]);
  });
  it("falhas de comissão só aparecem com o módulo ligado e com falha", () => {
    expect(buildOverview(RAW).attention.some((item) => item.key === "reseller-failures")).toBe(false);
    expect(buildOverview({ ...RAW, reseller_failures: 0 }).attention.some((item) => item.key === "reseller-failures")).toBe(false);
    const on = buildOverview({ ...RAW, reseller_failures: 2 }).attention.find((item) => item.key === "reseller-failures");
    expect(on).toMatchObject({ count: 2, href: "/admin/revendedores/falhas", tone: "warning" });
  });
});

describe("serviço", () => {
  it("lê do repositório e monta a visão", async () => {
    const overview = await createAdminOverviewService({ get: async () => RAW }).get();
    expect(overview.generatedAt).toBe(RAW.generated_at);
    expect(overview.tiles).toHaveLength(6);
  });
});
