import { expect, test } from "@playwright/test";

/** As políticas falam do produto e mantêm o aviso até a revisão jurídica. */
test("privacidade cobre os dados coletados em campo e mantém o aviso", async ({ page }) => {
  await page.goto("/privacy");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Política de Privacidade");
  await expect(page.getByRole("note")).toContainText("Texto de exemplo");
  await expect(page.getByRole("heading", { name: /Fotos e assinaturas/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Link de aprovação/ })).toBeVisible();
  await expect(page.getByText(/a empresa é a controladora/)).toBeVisible();
});

test("reembolso explica o cancelamento e mantém o aviso", async ({ page }) => {
  await page.goto("/refund");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Política de Reembolso");
  await expect(page.getByRole("note")).toContainText("Texto de exemplo");
  await expect(page.getByText(/continua até o fim do período já pago/)).toBeVisible();
  await expect(page.getByRole("heading", { name: /plano gratuito/ })).toBeVisible();
});
