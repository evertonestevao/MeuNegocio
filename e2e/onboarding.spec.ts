import { expect, test } from "@playwright/test";
import { completeCompany, PASSWORD, uniqueEmail } from "./helpers";
import { admin } from "./reseller-helpers";

async function leadOf(email: string) {
  const { data } = await admin.from("signup_leads").select("*").eq("email", email).maybeSingle();
  return data;
}

test("cadastro em etapas: nome e e-mail guardados antes da senha, assinatura e dados da empresa no fim", async ({ page }) => {
  const email = uniqueEmail("etapas");

  await page.goto("/");
  await page.getByRole("button", { name: "Assinar", exact: true }).click();
  await expect(page).toHaveURL(/\/comecar$/);
  await expect(page.getByRole("radio")).toHaveCount(0);
  await expect(page.getByText("Os primeiros 7 dias são grátis.")).toBeVisible();
  await expect(page.getByText("Guardamos seu nome e e-mail a partir daqui")).toBeVisible();

  await page.getByLabel("Seu nome").fill("Ana Etapas");
  await page.getByLabel("E-mail", { exact: true }).fill(email.toUpperCase());
  await page.getByRole("checkbox", { name: /Li e aceito/ }).check();
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page).toHaveURL(/\/comecar\/senha/);
  await expect(page.getByText("Olá, Ana! Crie sua senha")).toBeVisible();
  await expect(page.getByLabel("E-mail", { exact: true })).toHaveValue(email);

  // Guardado já no primeiro passo, com a prova do aceite e sem conta criada.
  const lead = await leadOf(email);
  expect(lead).toMatchObject({ full_name: "Ana Etapas", stage: "contact", email_consent: false, user_id: null });
  expect(lead.terms_version_id).not.toBeNull();
  expect(lead.ip_address).not.toBeNull();

  await page.getByLabel("Senha").fill(PASSWORD);
  await page.getByRole("button", { name: "Criar conta e escolher o plano" }).click();
  await expect(page).toHaveURL(/\/assinar/);
  await expect(page.getByRole("list", { name: "Etapas do cadastro" })).toBeVisible();
  expect((await leadOf(email)).stage).toBe("account");

  // Sem os dados da empresa, o painel manda de volta para o último passo.
  await page.getByRole("button", { name: "Começar agora: 7 dias grátis" }).click();
  await expect(page).toHaveURL(/\/onboarding/);
  await page.goto("/dashboard/quotes");
  await expect(page).toHaveURL(/\/onboarding/);

  // Erro do servidor não apaga o que foi digitado.
  await page.getByLabel("Nome da empresa").fill("Empresa Etapas E2E");
  await page.getByLabel("Telefone ou WhatsApp").fill("(14) 9999");
  await page.getByRole("button", { name: "Concluir e entrar no sistema" }).click();
  await expect(page.getByText("Informe o telefone com DDD.")).toBeVisible();
  await expect(page.getByLabel("Nome da empresa")).toHaveValue("Empresa Etapas E2E");

  await page.getByText("Mais dados (opcional)").click();
  await page.getByLabel("Endereço").fill("Rua das Flores, 10");
  await page.getByLabel("Fuso").selectOption("America/Manaus");
  await completeCompany(page, "Empresa Etapas E2E");
  await expect(page.locator("main").getByText("Empresa Etapas E2E").first()).toBeVisible();
  expect((await leadOf(email)).stage).toBe("done");

  await page.goto("/dashboard/settings");
  await expect(page.getByLabel("Telefone")).toHaveValue("(14) 99999-0000");
  await expect(page.getByLabel("Endereço")).toHaveValue("Rua das Flores, 10");
  await expect(page.getByLabel("Fuso")).toHaveValue("America/Manaus");
  await expect(page.getByLabel("Validade padrão do orçamento (dias)")).toHaveValue("15");

  // Concluído, o último passo não abre de novo.
  await page.goto("/onboarding");
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("corrigir volta ao primeiro passo preenchido e não deixa o e-mail errado guardado", async ({ page }) => {
  const wrong = uniqueEmail("errado");
  const right = uniqueEmail("certo");
  await page.goto("/comecar");
  await page.getByLabel("Seu nome").fill("Edu Corrige");
  await page.getByLabel("E-mail", { exact: true }).fill(wrong);
  await page.getByRole("checkbox", { name: /Li e aceito/ }).check();
  await page.getByRole("checkbox", { name: /comunicações por e-mail/ }).check();
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page).toHaveURL(/\/comecar\/senha/);

  await page.getByRole("link", { name: "Corrigir" }).click();
  await expect(page).toHaveURL(/\/comecar$/);
  await expect(page.getByLabel("Seu nome")).toHaveValue("Edu Corrige");
  await expect(page.getByLabel("E-mail", { exact: true })).toHaveValue(wrong);
  await expect(page.getByRole("checkbox", { name: /Li e aceito/ })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: /comunicações por e-mail/ })).toBeChecked();

  await page.getByLabel("E-mail", { exact: true }).fill(right);
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page).toHaveURL(/\/comecar\/senha/);
  await expect(page.getByLabel("E-mail", { exact: true })).toHaveValue(right);
  expect(await leadOf(wrong)).toBeNull();
  expect(await leadOf(right)).toMatchObject({ full_name: "Edu Corrige", email_consent: true, stage: "contact" });
});

test("passo da senha sem o primeiro passo volta ao começo", async ({ page }) => {
  await page.goto("/comecar/senha");
  await expect(page).toHaveURL(/\/comecar$/);
});

test("robô que preenche o campo escondido não deixa cadastro guardado", async ({ page }) => {
  const email = uniqueEmail("robo");
  await page.goto("/comecar");
  await page.getByLabel("Seu nome").fill("Robô");
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.locator("#website").fill("http://spam.example", { force: true });
  await page.getByRole("checkbox", { name: /Li e aceito/ }).check();
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page).toHaveURL(/\/comecar$/);
  expect(await leadOf(email)).toBeNull();
});
