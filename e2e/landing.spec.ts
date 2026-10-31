import { expect, test } from "@playwright/test";

/** A página inicial vende o produto, com os planos do banco, sem restos do template. */
test("landing mostra o produto, os planos ativos e os dados legais", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("visita técnica");

  const body = await page.locator("body").innerText();
  expect(body).not.toMatch(/starter|template|supabase|next\.js/i);

  const plans = page.locator("#planos");
  await expect(plans.getByText("Grátis", { exact: true })).toBeVisible();
  await expect(plans.getByText(/R\$/).first()).toBeVisible();
  await plans.getByRole("button", { name: "Começar grátis" }).click();
  await expect(page).toHaveURL(/\/signup/);

  await page.goto("/");
  await expect(page.getByRole("contentinfo")).toContainText("CNPJ");
  await page.getByText("Emite nota fiscal?").click();
  await expect(page.getByText(/A nota continua sendo emitida por fora/)).toBeVisible();
});
