import { expect, test } from "@playwright/test";
import { PASSWORD, uniqueEmail } from "./helpers";

test("onboarding recusa dado inválido sem perder o digitado e grava os dados da empresa", async ({ page }) => {
  await page.goto("/signup");
  await page.getByLabel("Nome completo").fill("Owner Onboarding");
  await page.getByLabel("E-mail").fill(uniqueEmail("onboarding"));
  await page.getByLabel("Senha").fill(PASSWORD);
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page).toHaveURL(/\/onboarding/);

  await page.getByLabel("Nome da empresa").fill("Empresa Onboarding E2E");
  await page.getByLabel("CNPJ").fill("11.222.333/0001-81");
  await page.getByLabel("Telefone").fill("(14) 99999-0000");
  await page.getByLabel("Endereço").fill("Rua das Flores, 10");
  await page.getByLabel("Fuso").selectOption("America/Manaus");
  await page.getByLabel("Observações padrão").fill("Pagamento em 30 dias.");
  await page.getByRole("checkbox", { name: /Li e aceito/ }).check();

  await page.getByLabel("Validade padrão do orçamento (dias)").fill("0");
  await page.getByRole("button", { name: "Criar empresa" }).click();
  await expect(page.getByText("A validade mínima é 1 dia.")).toBeVisible();
  await expect(page).toHaveURL(/\/onboarding/);
  await expect(page.getByLabel("Nome da empresa")).toHaveValue("Empresa Onboarding E2E");
  await expect(page.getByLabel("CNPJ")).toHaveValue("11.222.333/0001-81");

  await page.getByLabel("Validade padrão do orçamento (dias)").fill("30");
  await page.getByRole("button", { name: "Criar empresa" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.locator("main").getByText("Empresa Onboarding E2E")).toBeVisible();

  await page.goto("/dashboard/settings");
  await expect(page.getByLabel("CNPJ")).toHaveValue("11.222.333/0001-81");
  await expect(page.getByLabel("Telefone")).toHaveValue("(14) 99999-0000");
  await expect(page.getByLabel("Endereço")).toHaveValue("Rua das Flores, 10");
  await expect(page.getByLabel("Fuso")).toHaveValue("America/Manaus");
  await expect(page.getByLabel("Validade padrão do orçamento (dias)")).toHaveValue("30");
  await expect(page.getByLabel("Observações padrão")).toHaveValue("Pagamento em 30 dias.");
});
