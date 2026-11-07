import { expect, test } from "@playwright/test";
import { createClient, setupProCompany } from "./business-helpers";

const PHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1";

/** Desconto em %, envio, abertura do link pelo cliente e busca na lista de orçamentos. */
test("desconto em %, quem abriu o link e busca de orçamentos", async ({ page, browser }) => {
  await setupProCompany(page, "Empresa Visto E2E");
  await createClient(page, "Gonçalves Instalações", "Sede");

  await page.goto("/dashboard/quotes/new");
  await page.getByLabel("Cliente", { exact: true }).selectOption({ label: "Gonçalves Instalações" });
  // Um local só: já vem escolhido.
  await expect(page.getByLabel("Local do serviço")).toHaveValue(/[0-9a-f-]{36}/);
  await page.getByLabel("Título do serviço").fill("Iluminação do galpão");
  await page.getByRole("button", { name: "Item avulso" }).click();
  await page.locator("#line-0-description").fill("Luminária LED");
  await page.locator("#line-0-price").fill("1.000,00");
  await page.getByRole("group", { name: "Valor em reais ou porcentagem" }).getByRole("button", { name: "%" }).click();
  await page.getByLabel("Desconto").fill("10");
  await expect(page.getByText(/= R\$\s100,00/)).toBeVisible();
  await page.getByRole("button", { name: "Salvar rascunho" }).click();
  await expect(page).toHaveURL(/\/dashboard\/quotes\/[0-9a-f-]{36}/);
  const quoteUrl = page.url();
  await expect(page.getByText(/R\$\s900,00/).first()).toBeVisible();

  await page.getByRole("button", { name: "Marcar como enviado" }).click();
  await expect(page.getByText("O cliente ainda não abriu o link.")).toBeVisible();
  const link = await page.getByRole("link", { name: "Ver como o cliente" }).getAttribute("href");
  expect(link).toBeTruthy();
  const path = new URL(link!).pathname;

  // A própria empresa conferindo o link não conta.
  await page.goto(path);
  await expect(page.getByText("Iluminação do galpão")).toBeVisible();
  await page.goto(quoteUrl);
  await expect(page.getByText("O cliente ainda não abriu o link.")).toBeVisible();

  // O robô da prévia do WhatsApp também não.
  const bot = await browser.newContext({ userAgent: "WhatsApp/2.23.20.0 A" });
  await (await bot.newPage()).goto(path);
  await bot.close();
  await page.reload();
  await expect(page.getByText("O cliente ainda não abriu o link.")).toBeVisible();

  // O cliente, no celular, sem login.
  const customer = await browser.newContext({ userAgent: PHONE_UA });
  const customerPage = await customer.newPage();
  await customerPage.goto(path);
  await expect(customerPage.getByText(/R\$\s900,00/).first()).toBeVisible();
  await customer.close();

  await page.reload();
  await expect(page.getByText(/^Visto pelo cliente em \d{2}\/\d{2}\/\d{4} às \d{2}:\d{2}\.$/)).toBeVisible();
  await page.goto("/dashboard/quotes");
  await expect(page.getByText(/Visto em \d{2}\/\d{2}/)).toBeVisible();

  // Busca: sem acento pelo cliente, pelo número e por palavra do título.
  for (const search of ["goncalves", "1", "#0001", "iluminacao"]) {
    await page.goto(`/dashboard/quotes?q=${encodeURIComponent(search)}`);
    await expect(page.getByText("Iluminação do galpão")).toBeVisible();
  }
  await page.goto("/dashboard/quotes?q=inexistente");
  await expect(page.getByText("Nenhum orçamento encontrado")).toBeVisible();
});
