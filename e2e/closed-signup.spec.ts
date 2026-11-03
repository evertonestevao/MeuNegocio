import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { uniqueEmail } from "./helpers";
import { admin, makeSuperAdmin } from "./reseller-helpers";

/** Roda no servidor com o cadastro fechado, que é o padrão fora dos testes. */

test("sem cadastro aberto: nada oferece criar conta e a rota não abre", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Criar conta" })).toHaveCount(0);
  await expect(page.locator('a[href^="/signup"]')).toHaveCount(0);
  const whatsapp = await page.getByRole("button", { name: "Quero contratar" }).first().getAttribute("href");
  expect(whatsapp).toMatch(/^https:\/\/wa\.me\/5514997122258\?text=/);
  await page.goto("/signup");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("link", { name: "Criar conta" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Conhecer o sistema sem criar conta" })).toBeVisible();
});

test("convidado ainda consegue criar conta para aceitar o convite", async ({ page }) => {
  await page.goto(`/login?next=${encodeURIComponent(`/invites/accept?token=${randomUUID()}`)}`);
  await page.getByRole("link", { name: "Criar conta" }).click();
  await expect(page).toHaveURL(/\/signup/);
  await page.getByLabel("Nome completo").fill("Sem Convite");
  await page.getByLabel("E-mail").fill(uniqueEmail("sem-convite"));
  await page.getByLabel("Senha").fill("senha-e2e-12345");
  await page.getByRole("button", { name: "Criar conta" }).click();
  // Sem convite pendente para este e-mail, o servidor recusa, mesmo com a rota aberta.
  await expect(page.getByText(/feito pelo administrador/)).toBeVisible();
});

test("super admin cria empresa; responsável troca a senha e entra", async ({ browser, page }) => {
  const adminEmail = uniqueEmail("super");
  const { error } = await admin.auth.admin.createUser({ email: adminEmail, password: "senha-e2e-12345", email_confirm: true, user_metadata: { full_name: "Super Admin" } });
  if (error) throw error;
  await makeSuperAdmin(adminEmail);

  await page.goto("/login");
  await page.getByLabel("E-mail").fill(adminEmail);
  await page.getByLabel("Senha").fill("senha-e2e-12345");
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.getByRole("checkbox", { name: /Li e aceito/ }).or(page.getByText("Sua conta ainda não tem empresa")).first().waitFor();
  if (await page.getByRole("checkbox", { name: /Li e aceito/ }).count()) {
    await page.getByRole("checkbox", { name: /Li e aceito/ }).check();
    await page.getByRole("button", { name: "Aceitar e continuar" }).click();
    await page.waitForURL((url) => !url.pathname.includes("accept-terms"));
  }
  await page.goto("/admin/empresas");

  const ownerEmail = uniqueEmail("responsavel");
  const company = `Empresa Criada ${Date.now()}`;
  await page.getByLabel("Nome da empresa").fill(company);
  await page.getByLabel("Nome do responsável").fill("Ana Responsável");
  await page.getByLabel("E-mail do responsável").fill(ownerEmail);
  await page.getByLabel("Plano").selectOption({ label: "Anual" });
  await page.getByRole("button", { name: "Criar empresa e acesso" }).click();
  const password = await page.getByTestId("temporary-password").innerText();
  expect(password.length).toBeGreaterThanOrEqual(12);
  await expect(page.getByText(company, { exact: true })).toBeVisible();

  // E-mail repetido é recusado, sem criar nada.
  await page.getByLabel("Nome da empresa").fill("Outra Empresa");
  await page.getByLabel("Nome do responsável").fill("Ana Responsável");
  await page.getByLabel("E-mail do responsável").fill(ownerEmail);
  await page.getByRole("button", { name: "Criar empresa e acesso" }).click();
  await expect(page.getByText("Já existe uma conta com este e-mail.")).toBeVisible();

  const owner = await (await browser.newContext({ baseURL: test.info().project.use.baseURL })).newPage();
  await owner.goto("/login");
  await owner.getByLabel("E-mail").fill(ownerEmail);
  await owner.getByLabel("Senha").fill(password);
  await owner.getByRole("button", { name: "Entrar" }).click();
  await owner.waitForURL(/reset-password/);
  // Antes de trocar a senha, nenhuma tela abre.
  await owner.goto("/dashboard/clients");
  await expect(owner).toHaveURL(/reset-password/);
  await owner.getByLabel("Nova senha").fill("senha-nova-e2e-123");
  await owner.getByRole("button", { name: "Salvar nova senha" }).click();
  // Passa por /dashboard e cai nos termos: espera a tela, não o endereço.
  await owner.getByRole("checkbox", { name: /Li e aceito/ }).check();
  await owner.getByRole("button", { name: "Aceitar e continuar" }).click();
  await expect(owner.locator("main").getByText(company).first()).toBeVisible();
  await owner.goto("/dashboard/billing");
  await expect(owner.getByText("Plano atual:")).toContainText("Anual");

  // Quem não é super admin não vê o painel nem pode criar outra empresa pelo menu.
  await owner.goto("/admin/empresas");
  await expect(owner).toHaveURL(/\/dashboard$/);
  await owner.getByRole("button", { name: company }).click();
  await expect(owner.getByRole("menuitem", { name: "Nova empresa" })).toHaveCount(0);
});
