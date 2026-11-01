import { describe, expect, it } from "vitest";
import { withPublicOrigin } from "./supabaseStorageProvider";

describe("withPublicOrigin", () => {
  const signed = "http://127.0.0.1:54341/storage/v1/object/sign/work-orders/a/b.jpg?token=abc";

  it("mantém o link quando não há origem pública", () => {
    expect(withPublicOrigin(signed, undefined)).toBe(signed);
  });

  it("troca só a origem e preserva caminho e token", () => {
    expect(withPublicOrigin(signed, "https://app.exemplo.com/")).toBe(
      "https://app.exemplo.com/storage/v1/object/sign/work-orders/a/b.jpg?token=abc",
    );
  });
});
