import { expect, test } from "@playwright/test";
import { createClient, setupProCompany } from "./business-helpers";

/** Revenda do serviço de um parceiro: custo e acréscimo ficam com a empresa; o cliente vê só o preço. */
test("valor a mais sobre o que o parceiro cobra forma o preço e não aparece para o cliente", async ({ browser, page }) => {
  await setupProCompany(page, `Empresa Revenda E2E ${Date.now()}`);
  await createClient(page, "Cliente Revenda E2E", "Sede");

  await page.goto("/dashboard/quotes/new");
  await page.getByLabel("Cliente").selectOption({ label: "Cliente Revenda E2E" });
  await page.getByLabel("Título do serviço").fill("Conserto telhado");
  await page.getByRole("button", { name: "Item avulso" }).click();
  await page.getByLabel("Descrição").first().fill("Mão de obra do parceiro");
  // O valor digitado é o que o parceiro cobra; o "a mais" fica só com a empresa.
  await page.getByLabel("Valor unitário").fill("8.500,00");
  await page.getByLabel("A mais nesta linha").fill("20");

  await expect(page.getByText("O cliente vê R$ 10.200,00", { exact: false })).toBeVisible();
  await expect(page.getByText("R$ 1.700,00").first()).toBeVisible();
  await expect(page.getByText("(17% do preço)")).toBeVisible();

  await page.getByRole("button", { name: "Salvar rascunho" }).click();
  await expect(page.getByRole("heading", { name: /Orçamento Nº/ })).toBeVisible();
  // Ao reabrir, o valor do parceiro continua no campo e o "a mais" aparece em reais.
  await expect(page.getByLabel("Valor unitário")).toHaveValue("8.500,00");
  await expect(page.getByLabel("A mais nesta linha")).toHaveValue("1.700,00");
  await expect(page.getByText("R$ 10.200,00").first()).toBeVisible();

  await page.getByRole("button", { name: "Marcar como enviado" }).click();
  const link = await page.getByRole("link", { name: "Ver como o cliente" }).getAttribute("href");
  const visitor = await browser.newContext();
  const client = await visitor.newPage();
  await client.goto(new URL(link as string).pathname);
  await expect(client.getByText("R$ 10.200,00").first()).toBeVisible();
  const text = await client.locator("body").innerText();
  expect(text).not.toMatch(/8\.500|acréscimo|custo|lucro|margem/i);
  await visitor.close();
});
