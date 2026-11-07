import { describe, expect, it } from "vitest";
import { followsUserTheme } from "./theme";

describe("tema escuro só no sistema logado", () => {
  it.each(["/dashboard", "/dashboard/quotes/abc", "/admin/planos", "/vendedor"])("%s segue o tema escolhido", (path) => {
    expect(followsUserTheme(path)).toBe(true);
  });

  it.each(["/", "/login", "/comecar", "/comecar/senha", "/assinar", "/onboarding", "/orcamento/abc", "/terms", "/dashboardx"])("%s fica sempre claro", (path) => {
    expect(followsUserTheme(path)).toBe(false);
  });
});
