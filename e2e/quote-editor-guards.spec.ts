import { expect, test } from "@playwright/test";
import { createClient, setupProCompany } from "./business-helpers";

/** Proteções do editor: cliente obrigatório, desconto até o subtotal e aviso de alteração não salva. */
test("editor não salva orçamento vazio nem desconto acima do subtotal, e avisa antes de perder alterações", async ({ page, context }) => {
  await setupProCompany(page, "Empresa Editor E2E");
  await createClient(page, "Cliente Editor E2E", "Sede");

  // Sem cliente, nada é criado: a tela continua em /new, sem número gasto.
  await page.goto("/dashboard/quotes/new");
  await page.getByRole("button", { name: "Salvar rascunho" }).click();
  await expect(page.getByText("Escolha o cliente.")).toBeVisible();
  await expect(page).toHaveURL(/\/dashboard\/quotes\/new$/);

  await page.getByLabel("Cliente").selectOption({ label: "Cliente Editor E2E" });
  await page.getByRole("button", { name: "Item avulso" }).click();
  await page.locator("#line-0-description").fill("Instalação de tomadas");
  await page.locator("#line-0-price").fill("100,00");
  await page.getByLabel("Desconto").fill("150,00");
  await page.getByRole("button", { name: "Salvar rascunho" }).click();
  await expect(page.getByText(/O desconto não pode passar do subtotal \(R\$\s100,00\)\./)).toBeVisible();
  await expect(page).toHaveURL(/\/dashboard\/quotes\/new$/);

  // Desconto apagado é sem desconto.
  await page.getByLabel("Desconto").fill("");
  await page.getByRole("button", { name: "Salvar rascunho" }).click();
  await expect(page).toHaveURL(/\/dashboard\/quotes\/[0-9a-f-]{36}/);
  await expect(page.getByRole("heading", { name: "Orçamento Nº 0001" })).toBeVisible();
  await expect(page.getByText("Alterações não salvas.", { exact: false })).toHaveCount(0);

  // No rascunho, o texto copiado vai sem o link de aprovação, que ainda não abre.
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByRole("button", { name: "Copiar texto" }).click();
  await expect(page.getByText("Texto copiado, sem o link")).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain("orçamento Nº 0001");
  expect(copied).not.toContain("/orcamento/");

  // Alteração sem salvar: o link para outra tela pede confirmação; cancelar fica na tela.
  await page.locator("#quote-notes").fill("Observação que ainda não foi salva");
  await expect(page.getByText("Alterações não salvas.", { exact: false })).toBeVisible();
  page.once("dialog", (dialog) => void dialog.dismiss());
  await page.getByRole("link", { name: "Orçamentos" }).first().click();
  await expect(page).toHaveURL(/\/dashboard\/quotes\/[0-9a-f-]{36}/);
  await expect(page.locator("#quote-notes")).toHaveValue("Observação que ainda não foi salva");

  // Salvo, sai sem perguntar.
  await page.getByRole("button", { name: "Salvar rascunho" }).click();
  await expect(page.getByText("Orçamento salvo")).toBeVisible();
  await expect(page.getByText("Alterações não salvas.", { exact: false })).toHaveCount(0);
  let asked = false;
  page.once("dialog", (dialog) => {
    asked = true;
    void dialog.accept();
  });
  await page.getByRole("link", { name: "Orçamentos" }).first().click();
  await expect(page).toHaveURL(/\/dashboard\/quotes$/);
  expect(asked).toBe(false);
});
