import { expect, test } from "@playwright/test";
import { PASSWORD, uniqueEmail } from "./helpers";
import { admin } from "./reseller-helpers";

test("empresa nova escolhe como começar: cartão primeiro, teste sem cartão no fim", async ({ page }) => {
  await page.goto("/signup");
  await page.getByLabel("Nome completo").fill("Dona Teste");
  await page.getByLabel("E-mail").fill(uniqueEmail("teste-gratis"));
  await page.getByLabel("Senha").fill(PASSWORD);
  await page.getByRole("button", { name: "Criar conta" }).click();
  await page.getByLabel("Nome da empresa").fill("Empresa Teste Grátis");
  await page.getByRole("checkbox", { name: /Li e aceito/ }).check();
  await page.getByRole("button", { name: "Criar empresa" }).click();

  // Sem assinatura, o painel manda para a tela de assinar.
  await expect(page).toHaveURL(/\/assinar/);
  await expect(page.getByRole("button", { name: "Começar agora: 7 dias grátis" })).toBeVisible();
  await expect(page.getByText(/Nada é cobrado hoje\. A primeira cobrança de R\$\s[\d.,]+ será em \d{2}\/\d{2}\/\d{4}/)).toBeVisible();
  await expect(page.getByText("Ainda na dúvida se quer assinar?")).toBeVisible();
  // O anual cobra na hora, em até 12x: não promete grátis.
  await page.getByRole("radio", { name: /Anual/ }).click();
  await expect(page.getByRole("button", { name: /Assinar o plano Anual/ })).toBeVisible();

  await page.getByRole("button", { name: "Teste por 7 dias sem cartão" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText(/Faltam 7 dias do seu teste grátis/)).toBeVisible();

  // Teste vencido: o acesso pausa, os dados ficam e não há segundo teste.
  const { data: company } = await admin.from("companies").select("id").eq("name", "Empresa Teste Grátis").order("created_at", { ascending: false }).limit(1).single();
  await admin.from("subscriptions").update({ current_period_end: new Date(Date.now() - 60_000).toISOString() }).eq("company_id", company!.id);
  await page.goto("/dashboard/quotes");
  await expect(page).toHaveURL(/\/assinar/);
  await expect(page.getByText(/está pausado\. Seus dados continuam guardados/)).toBeVisible();
  await expect(page.getByText("Ainda na dúvida se quer assinar?")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Assinar o plano Mensal/ })).toBeVisible();

  // Assinou (gateway de teste): volta ao painel.
  await page.getByRole("button", { name: /Assinar o plano Mensal/ }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText(/teste grátis/)).toHaveCount(0);
});
