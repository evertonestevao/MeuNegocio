import { describe, expect, it } from "vitest";
import { safeEqual } from "./safeEqual";

describe("safeEqual", () => {
  it("aceita iguais e recusa diferentes, de qualquer tamanho", () => {
    expect(safeEqual("Bearer segredo", "Bearer segredo")).toBe(true);
    expect(safeEqual("Bearer segredo", "Bearer segredo2")).toBe(false);
    expect(safeEqual("", "Bearer segredo")).toBe(false);
    expect(safeEqual("a", "")).toBe(false);
    expect(safeEqual("", "")).toBe(true);
  });
});
