import { expect, type Page } from "@playwright/test";

/** Cria conta nova + primeira empresa e chega ao dashboard. */
export async function signupAndOnboard(
  page: Page,
  { email, password, name, company }: {
    email: string;
    password: string;
    name: string;
    company: string;
  },
) {
  await page.goto("/signup");
  await page.getByLabel("Nome completo").fill(name);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(password);
  await page.getByRole("button", { name: "Criar conta" }).click();

  // onboarding: aceite dos termos vigentes + primeira empresa
  await expect(page).toHaveURL(/\/onboarding/);
  await expect(page.getByText("Crie sua empresa")).toBeVisible();
  await page.getByLabel("Nome da empresa").fill(company);
  await page.getByRole("checkbox", { name: /Li e aceito/ }).check();
  await page.getByRole("button", { name: "Criar empresa" }).click();

  // Empresa nova ainda não tem assinatura: começa o teste de 7 dias sem cartão.
  await startCardlessTrial(page);
  await expect(page.locator("main").getByText(company).first()).toBeVisible();
}

/** Na tela de assinar, começa o teste sem cartão e volta ao painel. */
export async function startCardlessTrial(page: Page) {
  await expect(page).toHaveURL(/\/assinar/);
  await page.getByRole("button", { name: "Teste por 7 dias sem cartão" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

export function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e4)}@e2e.local`;
}

export const PASSWORD = "senha-e2e-12345";
