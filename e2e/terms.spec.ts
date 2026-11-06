import { expect, test } from "@playwright/test";
import { PASSWORD, uniqueEmail } from "./helpers";

/** Gate de termos (LGPD): sem aceite, o cadastro não passa do primeiro passo. */
test("cadastro exige aceite dos termos; sem marcar, não avança", async ({ page }) => {
  await page.goto("/comecar");
  await page.getByLabel("Seu nome").fill("Sem Termos E2E");
  await page.getByLabel("E-mail", { exact: true }).fill(uniqueEmail("terms"));
  const checkbox = page.getByRole("checkbox", { name: /Li e aceito/ });
  await expect(checkbox).toBeVisible();

  // tenta continuar SEM aceitar: a validação nativa (required) segura o envio
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page).toHaveURL(/\/comecar$/);

  // o consentimento de email é OPCIONAL: aceita só os termos e avança
  await checkbox.check();
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page).toHaveURL(/\/comecar\/senha/);
  await page.getByLabel("Senha").fill(PASSWORD);
  await page.getByRole("button", { name: "Criar conta e escolher o plano" }).click();
  // O aceite do primeiro passo vale para a conta: não pede de novo.
  await expect(page).toHaveURL(/\/assinar/);
});

test("link dos termos abre a versão vigente com aviso de placeholder", async ({ page }) => {
  await page.goto("/terms");
  await expect(page.getByRole("heading", { name: "Termos de Uso" })).toBeVisible();
  await expect(page.getByText("TEXTO DE EXEMPLO")).toBeVisible();
});
