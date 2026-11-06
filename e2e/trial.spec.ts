import { expect, test } from "@playwright/test";
import { completeCompany, PASSWORD, signupUntilSubscribe, uniqueEmail } from "./helpers";
import { admin } from "./reseller-helpers";

test("tela de assinar oferece só os 7 dias grátis com cartão no mensal", async ({ page }) => {
  await signupUntilSubscribe(page, { email: uniqueEmail("teste-gratis"), password: PASSWORD, name: "Dona Teste" });

  // Sem assinatura, o painel manda para a tela de assinar.
  await expect(page).toHaveURL(/\/assinar/);
  await expect(page.getByRole("button", { name: "Começar agora: 7 dias grátis" })).toBeVisible();
  await expect(page.getByText(/Nada é cobrado hoje\. A primeira cobrança de R\$\s[\d.,]+ será em \d{2}\/\d{2}\/\d{4}/)).toBeVisible();
  // Teste sem cartão está desligado: nada no fim da tela.
  await expect(page.getByText("Ainda na dúvida se quer assinar?")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Teste por 7 dias sem cartão" })).toHaveCount(0);
  // O anual cobra na hora, em até 12x: não promete grátis.
  await page.getByRole("radio", { name: /Anual/ }).click();
  await expect(page.getByRole("button", { name: /Assinar o plano Anual/ })).toBeVisible();

  await page.getByRole("radio", { name: /Mensal/ }).click();
  await page.getByRole("button", { name: "Começar agora: 7 dias grátis" }).click();
  await completeCompany(page, "Empresa Teste Grátis");
  await expect(page).toHaveURL(/\/dashboard$/);

  // Cancelou durante o teste e o período acabou: o acesso pausa, os dados ficam e não há segundo teste.
  const { data: company } = await admin.from("companies").select("id").eq("name", "Empresa Teste Grátis").order("created_at", { ascending: false }).limit(1).single();
  await admin.from("subscriptions").update({ status: "canceled", current_period_end: new Date(Date.now() - 60_000).toISOString() }).eq("company_id", company!.id);
  await page.goto("/dashboard/quotes");
  await expect(page).toHaveURL(/\/assinar/);
  await expect(page.getByText(/está pausado\. Seus dados continuam guardados/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Começar agora: 7 dias grátis" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Assinar o plano Mensal/ })).toBeVisible();

  // Assinou (gateway de teste): volta ao painel.
  await page.getByRole("button", { name: /Assinar o plano Mensal/ }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText(/teste grátis/)).toHaveCount(0);
});
