import { expect, test } from "@playwright/test";
import { PASSWORD, signupAndOnboard, uniqueEmail } from "./helpers";

/** Fluxo crítico 1: login → dashboard (plano §12). */
test("signup, logout e login levam ao dashboard", async ({ page }) => {
  const email = uniqueEmail("auth");

  await signupAndOnboard(page, {
    email,
    password: PASSWORD,
    name: "Usuária E2E",
    company: "Empresa Auth E2E",
  });

  // logout pelo menu do usuário
  await page.getByRole("button", { name: "Menu do usuário" }).click();
  await page.getByRole("menuitem", { name: "Sair" }).click();
  await expect(page).toHaveURL(/\/login/);

  // rota protegida sem sessão volta para login
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);

  // login → dashboard
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.locator("main").getByText("Empresa Auth E2E")).toBeVisible();
});

test("next= com barra invertida não leva para outro site depois do login", async ({ page, context }) => {
  const email = uniqueEmail("next");
  await signupAndOnboard(page, { email, password: PASSWORD, name: "Usuária Next", company: "Empresa Next E2E" });
  await context.clearCookies();
  // O navegador lê "/\" como "//": sem o filtro, iria para evil.example.
  await context.route((url) => url.hostname === "evil.example", (route) => route.abort());

  await page.goto(`/login?next=${encodeURIComponent("/\\evil.example")}`);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/localhost:\d+\/dashboard/);
});

test("sessão encerrada volta ao login, sem loop, e não derruba o outro aparelho", async ({ page, browser }) => {
  const email = uniqueEmail("sessao");
  await signupAndOnboard(page, { email, password: PASSWORD, name: "Usuária Sessão", company: "Empresa Sessão E2E" });

  // Segundo aparelho, com sessão própria.
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await otherPage.goto("/login");
  await otherPage.getByLabel("E-mail").fill(email);
  await otherPage.getByLabel("Senha").fill(PASSWORD);
  await otherPage.getByRole("button", { name: "Entrar" }).click();
  await expect(otherPage).toHaveURL(/\/dashboard/);

  // Guarda os cookies de agora e sai: os guardados viram uma sessão encerrada no servidor.
  const stale = await page.context().storageState();
  await page.getByRole("button", { name: "Menu do usuário" }).click();
  await page.getByRole("menuitem", { name: "Sair" }).click();
  await expect(page).toHaveURL(/\/login/);

  const old = await browser.newContext({ storageState: stale });
  const oldPage = await old.newPage();
  await oldPage.goto("/dashboard");
  await expect(oldPage).toHaveURL(/\/login/);
  await expect(oldPage.getByRole("button", { name: "Entrar" })).toBeVisible();

  // Sair num aparelho não encerra a sessão do outro.
  await otherPage.goto("/dashboard/clients");
  await expect(otherPage).toHaveURL(/\/dashboard\/clients/);

  await old.close();
  await other.close();
});

test("login com senha errada mostra erro e não navega", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(uniqueEmail("inexistente"));
  await page.getByLabel("Senha").fill("senha-errada-123");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByText("E-mail ou senha incorretos.")).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

test("senha errada mantém o e-mail e mostra só o aviso", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill("ninguem-e2e@e2e.local");
  await page.getByLabel("Senha", { exact: true }).fill("senha-errada-123");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.locator('[data-slot="alert"]')).toContainText(/incorret/i);
  await expect(page.getByLabel("E-mail")).toHaveValue("ninguem-e2e@e2e.local");
  await expect(page.getByLabel("Senha", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Senha", { exact: true })).toBeFocused();
});
