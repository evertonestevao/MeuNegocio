import { describe, expect, it } from "vitest";
import { safeInternalPath } from "./safeRedirect";

describe("safeInternalPath", () => {
  it.each([
    ["/dashboard", "/dashboard"],
    ["/dashboard/quotes/abc?tab=itens#total", "/dashboard/quotes/abc?tab=itens#total"],
    ["/invites/accept?token=x", "/invites/accept?token=x"],
    ["/reset-password", "/reset-password"],
  ])("aceita o caminho interno %s", (input, expected) => {
    expect(safeInternalPath(input, "/fallback")).toBe(expected);
  });

  it.each([
    "https://evil.example/x",
    "http:/evil.example",
    "//evil.example/x",
    "/\\evil.example",
    "/\\/evil.example",
    "\\\\evil.example",
    "/\t/evil.example",
    "/\n/evil.example",
    "javascript:alert(1)",
    "dashboard",
    "",
    null,
    undefined,
    42,
  ])("recusa %j e usa o padrão", (input) => {
    expect(safeInternalPath(input, "/fallback")).toBe("/fallback");
  });
});
