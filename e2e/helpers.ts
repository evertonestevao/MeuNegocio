import { expect, type Page } from "@playwright/test";

/** Cadastro em etapas até a senha: nome, e-mail e aceite; depois a senha, que leva à tela de assinar. */
export async function signupUntilSubscribe(page: Page, { email, password, name }: { email: string; password: string; name: string }) {
  await page.goto("/comecar");
  await page.getByLabel("Seu nome").fill(name);
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByRole("checkbox", { name: /Li e aceito/ }).check();
  await page.getByRole("button", { name: "Continuar" }).click();

  await expect(page).toHaveURL(/\/comecar\/senha/);
  await page.getByLabel("Senha").fill(password);
  await page.getByRole("button", { name: "Criar conta e escolher o plano" }).click();
  await expect(page).toHaveURL(/\/assinar/);
}

/** Último passo: nome de verdade e telefone da empresa, e entra no painel. */
export async function completeCompany(page: Page, company: string) {
  await expect(page).toHaveURL(/\/onboarding/);
  await page.getByLabel("Nome da empresa").fill(company);
  await page.getByLabel("Telefone ou WhatsApp").fill("(14) 99999-0000");
  await page.getByRole("button", { name: "Concluir e entrar no sistema" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

/** Cria conta nova + primeira empresa (no teste grátis sem cartão) e chega ao dashboard. */
export async function signupAndOnboard(
  page: Page,
  { email, password, name, company }: {
    email: string;
    password: string;
    name: string;
    company: string;
  },
) {
  await signupUntilSubscribe(page, { email, password, name });
  await page.getByRole("button", { name: "Teste por 7 dias sem cartão" }).click();
  await completeCompany(page, company);
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
