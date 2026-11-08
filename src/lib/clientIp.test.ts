import { describe, expect, it } from "vitest";
import { clientIp } from "./clientIp";

const h = (entries: Record<string, string>) => new Headers(entries);

describe("clientIp", () => {
  it("prefere cf-connecting-ip, ignorando o x-forwarded-for que o cliente inventa", () => {
    expect(clientIp(h({ "cf-connecting-ip": "203.0.113.7", "x-forwarded-for": "1.1.1.1, 203.0.113.7" }))).toBe("203.0.113.7");
  });

  it("sem cf, usa x-real-ip", () => {
    expect(clientIp(h({ "x-real-ip": "198.51.100.9", "x-forwarded-for": "1.1.1.1" }))).toBe("198.51.100.9");
  });

  it("sem cf nem x-real-ip, usa o último salto do XFF (não o primeiro, que é falsificável)", () => {
    expect(clientIp(h({ "x-forwarded-for": "1.1.1.1, 2.2.2.2, 198.51.100.9" }))).toBe("198.51.100.9");
  });

  it("sem nenhum header, devolve desconhecido", () => {
    expect(clientIp(h({}))).toBe("desconhecido");
  });
});
