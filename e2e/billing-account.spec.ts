import { expect, test } from "@playwright/test";
import { PASSWORD, signupAndOnboard, uniqueEmail } from "./helpers";

/**
 * Caminho que passa por service_role e pelos GRANTs do client: assinar (gateway
 * fake simula o webhook), cancelar, assinar de novo, exportar dados e excluir a conta.
 */
test("assinatura, reativação, exportação e exclusão de conta", async ({ page }) => {
  const email = uniqueEmail("billing");

  await signupAndOnboard(page, {
    email,
    password: PASSWORD,
    name: "Usuária Billing",
    company: "Empresa Billing E2E",
  });

  await page.goto("/dashboard/billing");
  await expect(page.getByText("Plano atual:")).toBeVisible();

  await page.getByRole("button", { name: "Ativar (teste)" }).first().click();
  await expect(page.getByText("assinatura ativa")).toBeVisible();

  await page.getByRole("button", { name: "Cancelar assinatura" }).click();
  await expect(page.getByText("· assinatura cancelada")).toBeVisible();
  // O período já pago continua valendo: o plano não cai para o Free na hora.
  await expect(page.getByText(/Acesso ao plano até/)).toBeVisible();
  await expect(page.getByText("Plano atual:")).not.toContainText("Gratuito");

  await page.getByRole("button", { name: "Ativar (teste)" }).first().click();
  await expect(page.getByText("assinatura ativa")).toBeVisible();

  await page.getByRole("button", { name: "Cancelar assinatura" }).click();
  await expect(page.getByText("· assinatura cancelada")).toBeVisible();

  const exported = await page.request.get("/api/account/export");
  expect(exported.status()).toBe(200);
  expect((await exported.json()).account.email).toBe(email);

  await page.goto("/dashboard/settings");
  await page.getByRole("button", { name: "Excluir minha conta" }).click();
  await page.getByLabel("Digite seu e-mail para confirmar").fill(email);
  await page.getByRole("button", { name: "Excluir definitivamente" }).click();
  await expect(page).toHaveURL(/\/$/);

  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByText("Email ou senha incorretos")).toBeVisible();
});

test("health check responde sem sessão, lendo o banco como anon", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.status()).toBe(200);
});
