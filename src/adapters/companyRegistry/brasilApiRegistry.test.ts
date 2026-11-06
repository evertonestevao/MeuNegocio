import { describe, expect, it, vi } from "vitest";
import { createBrasilApiRegistry } from "./brasilApiRegistry";

function respond(status: number, body: unknown = {}) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
}

describe("BrasilAPI", () => {
  it("se identifica (sem isso a base responde 403) e traduz o CNPJ encontrado", async () => {
    const fetchFn = respond(200, {
      cnpj: "11222333000181",
      razao_social: "EMPRESA LTDA",
      nome_fantasia: "",
      descricao_situacao_cadastral: "ATIVA",
      data_inicio_atividade: "2015-03-10",
      municipio: "BAURU",
      uf: "SP",
      qsa: [{ nome_socio: "ANA LIMA" }, { nome_socio: null }],
    });
    const lookup = await createBrasilApiRegistry({ userAgent: "teste/1.0", fetchFn }).lookup("11222333000181");
    const [url, init] = vi.mocked(fetchFn).mock.calls[0];
    expect(url).toBe("https://brasilapi.com.br/api/cnpj/v1/11222333000181");
    expect((init?.headers as Record<string, string>)["User-Agent"]).toBe("teste/1.0");
    expect(lookup).toEqual({
      status: "found",
      record: { cnpj: "11222333000181", officialName: "EMPRESA LTDA", tradeName: null, situation: "ATIVA", openedOn: "2015-03-10", city: "BAURU", state: "SP", partnerNames: ["ANA LIMA"] },
    });
  });

  it("404 é CNPJ inexistente; recusa, erro ou rede fora viram 'indisponível'", async () => {
    expect(await createBrasilApiRegistry({ userAgent: "t", fetchFn: respond(404) }).lookup("1")).toEqual({ status: "not_found" });
    expect(await createBrasilApiRegistry({ userAgent: "t", fetchFn: respond(403) }).lookup("1")).toEqual({ status: "unavailable" });
    expect(await createBrasilApiRegistry({ userAgent: "t", fetchFn: respond(500) }).lookup("1")).toEqual({ status: "unavailable" });
    const offline = vi.fn(async () => { throw new TypeError("fetch failed"); }) as unknown as typeof fetch;
    expect(await createBrasilApiRegistry({ userAgent: "t", fetchFn: offline }).lookup("1")).toEqual({ status: "unavailable" });
  });
});
