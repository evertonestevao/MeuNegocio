import { expect, test } from "@playwright/test";
import { PASSWORD, signupAndOnboard, startTrial, uniqueEmail } from "./helpers";

/** Fluxo crítico 3: trocar empresa ativa (plano §12). */
test("usuário com duas empresas alterna a ativa pelo switcher", async ({ page }) => {
  await signupAndOnboard(page, {
    email: uniqueEmail("multi"),
    password: PASSWORD,
    name: "Multi Empresa E2E",
    company: "Primeira Empresa E2E",
  });

  // cria a segunda empresa pelo switcher do header
  await page.getByRole("button", { name: /Primeira Empresa E2E/ }).click();
  await page.getByRole("menuitem", { name: "Nova empresa" }).click();
  await page.getByLabel("Nome da empresa").fill("Segunda Empresa E2E");
  await page.getByRole("checkbox", { name: /Declaro que sou responsável/ }).check();
  await page.getByRole("button", { name: "Criar empresa" }).click();

  // nova empresa vira a ativa e, sem assinatura, passa pela tela de assinar
  await startTrial(page);
  await expect(page.locator("main").getByText("Segunda Empresa E2E")).toBeVisible();

  // troca de volta para a primeira
  await page.getByRole("button", { name: /Segunda Empresa E2E/ }).click();
  await page.getByRole("menuitem", { name: "Primeira Empresa E2E" }).click();
  await expect(page.locator("main").getByText("Primeira Empresa E2E")).toBeVisible();

  // preferência persiste após reload (cookie revalidado no servidor)
  await page.reload();
  await expect(page.locator("main").getByText("Primeira Empresa E2E")).toBeVisible();
});
