import { expect, test } from "@playwright/test";
import { createClient, setupProCompany } from "./business-helpers";

/** Do catálogo ao faturamento: o cliente aprova pelo link, sem login, e o valor entra no financeiro. */
test("orçamento vai do rascunho ao faturamento pelo link de aprovação", async ({ browser, page }) => {
  await setupProCompany(page, "Empresa Orçamento E2E");
  await createClient(page, "Hotel E2E", "Unidade Centro");

  await page.goto("/dashboard/catalog?kind=service");
  await page.getByRole("button", { name: "Novo serviço" }).click();
  const item = page.getByRole("dialog");
  await item.getByLabel("Nome").fill("Mão de obra E2E");
  await item.getByLabel("Como cobrar").selectOption("hourly");
  await item.getByLabel("Preço por hora").fill("95,00");
  await item.getByLabel("Custo por hora").fill("40,00");
  await item.getByRole("button", { name: "Salvar" }).click();
  await expect(item).toBeHidden();

  await page.goto("/dashboard/quotes/new");
  await page.getByLabel("Cliente").selectOption({ label: "Hotel E2E" });
  await page.getByLabel("Título do serviço").fill("Ampliação elétrica");
  const picker = page.getByLabel("Adicionar do catálogo");
  await picker.selectOption(await picker.locator("option", { hasText: "Mão de obra E2E" }).getAttribute("value") ?? "");
  await page.getByLabel("Horas").fill("10");
  await page.getByLabel("Pessoas").fill("2");
  await page.getByLabel("Desconto (R$)").fill("100,00");

  // 10 h × 2 pessoas × R$ 95 − R$ 100.
  await expect(page.getByText("R$ 1.800,00").first()).toBeVisible();
  await page.getByRole("button", { name: "Salvar rascunho" }).click();
  await expect(page).toHaveURL(/\/dashboard\/quotes\/[0-9a-f-]{36}/);
  await expect(page.getByRole("heading", { name: "Orçamento Nº 0001" })).toBeVisible();

  await page.getByRole("button", { name: "Marcar como enviado" }).click();
  await expect(page.getByText("Aguardando o cliente")).toBeVisible();
  const publicLink = await page.getByRole("link", { name: "Ver como o cliente" }).getAttribute("href");
  expect(publicLink).toMatch(/\/orcamento\/[0-9a-f]{64}$/);

  const visitor = await browser.newContext();
  const client = await visitor.newPage();
  await client.goto(new URL(publicLink as string).pathname);
  await expect(client.getByText("Ampliação elétrica")).toBeVisible();
  await expect(client.getByText(/custo|margem/i)).toHaveCount(0);

  await client.getByRole("button", { name: "Aprovar orçamento" }).click();
  await expect(client.getByText("Informe seu nome.")).toBeVisible();
  await client.getByLabel("Seu nome").fill("Renato Cliente");
  await client.getByRole("button", { name: "Aprovar orçamento" }).click();
  await expect(client.getByText(/Orçamento aprovado/)).toBeVisible();
  await visitor.close();

  await page.reload();
  await expect(page.getByText(/Renato Cliente aprovou pelo link/)).toBeVisible();
  await page.getByRole("button", { name: "Fechar e faturar" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Fechar e faturar" }).click();
  await expect(page.getByText("Faturado")).toBeVisible();

  await page.goto("/dashboard/finance");
  await expect(page.getByText("#0001 · Ampliação elétrica")).toBeVisible();
  await expect(page.getByText("R$ 1.800,00").first()).toBeVisible();

  // Fechado sai do faturamento só por "desfazer".
  await page.getByRole("link", { name: /#0001/ }).click();
  await page.getByRole("button", { name: "Desfazer fechamento" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Desfazer fechamento" }).click();
  await expect(page.getByRole("button", { name: "Fechar e faturar" })).toBeVisible();
  await page.goto("/dashboard/finance");
  await expect(page.getByText("Feche um orçamento aprovado para lançar o faturamento.")).toBeVisible();
});
