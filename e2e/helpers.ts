import { expect, type Page } from "@playwright/test";
import { admin } from "./reseller-helpers";

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

/** Cria conta nova + primeira empresa (nos 7 dias grátis do mensal) e chega ao dashboard. */
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
  await page.getByRole("button", { name: "Começar agora: 7 dias grátis" }).click();
  await completeCompany(page, company);
  await expect(page.locator("main").getByText(company).first()).toBeVisible();
}

/**
 * Conta nova numa empresa em teste sem cartão, ainda sem vínculo com o meio de pagamento. A tela não
 * oferece mais esse teste: a assinatura é criada direto no banco, como as dos testes antigos em
 * andamento, para os cenários que começam numa empresa que ainda não pagou nada.
 */
export async function signupWithCardlessTrial(
  page: Page,
  { email, password, name, company }: { email: string; password: string; name: string; company: string },
) {
  await signupUntilSubscribe(page, { email, password, name });
  const { data: member } = await admin.rpc("find_user_id_by_email", { p_email: email });
  const { data: membership } = await admin.from("company_members").select("company_id").eq("user_id", member).single();
  const { data: plan } = await admin.from("plans").select("id").eq("code", "pro").single();
  const now = Date.now();
  const { error } = await admin.from("subscriptions").insert({
    company_id: membership!.company_id,
    plan_id: plan!.id,
    status: "trialing",
    current_period_start: new Date(now).toISOString(),
    current_period_end: new Date(now + 7 * 86_400_000).toISOString(),
    cancel_at_period_end: false,
    renews: false,
  });
  if (error) throw error;
  await page.goto("/dashboard");
  await completeCompany(page, company);
  await expect(page.locator("main").getByText(company).first()).toBeVisible();
}

/** Na tela de assinar, começa os 7 dias grátis do mensal (gateway de teste) e volta ao painel. */
export async function startTrial(page: Page) {
  await expect(page).toHaveURL(/\/assinar/);
  await page.getByRole("button", { name: "Começar agora: 7 dias grátis" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

export function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e4)}@e2e.local`;
}

export const PASSWORD = "senha-e2e-12345";
