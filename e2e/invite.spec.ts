import { expect, test } from "@playwright/test";
import { PASSWORD, signupAndOnboard, uniqueEmail } from "./helpers";

/** Fluxo crítico 2: criar empresa → convidar membro (plano §12). */
test("owner convida membro e vê o convite pendente", async ({ page }) => {
  await signupAndOnboard(page, {
    email: uniqueEmail("owner"),
    password: PASSWORD,
    name: "Owner E2E",
    company: "Empresa Convites E2E",
  });

  await page.getByRole("link", { name: "Membros" }).click();
  await expect(page).toHaveURL(/\/dashboard\/members/);

  const invitedEmail = uniqueEmail("convidado");
  await page.getByLabel("Email").fill(invitedEmail);
  await page.getByLabel("Papel").selectOption("member");
  await page.getByRole("button", { name: "Enviar convite" }).click();

  await expect(page.getByText("Convite enviado")).toBeVisible();
  await expect(page.getByText(invitedEmail)).toBeVisible();

  // revogação
  await page.getByRole("button", { name: `Revogar convite de ${invitedEmail}` }).click();
  await expect(page.getByText("Convite revogado")).toBeVisible();
  await expect(page.getByText(invitedEmail)).toBeHidden();
});

test("plano Free recusa o convite quando as vagas acabam", async ({ page }) => {
  await signupAndOnboard(page, {
    email: uniqueEmail("owner-free"),
    password: PASSWORD,
    name: "Owner Free E2E",
    company: "Empresa Vagas E2E",
  });
  await page.goto("/dashboard/members");

  // Owner + este convite ocupam as 2 vagas do Free.
  const firstEmail = uniqueEmail("primeiro");
  await page.getByLabel("Email").fill(firstEmail);
  await page.getByRole("button", { name: "Enviar convite" }).click();
  await expect(page.getByText("Convite enviado")).toBeVisible();

  const blockedEmail = uniqueEmail("sem-vaga");
  await page.getByLabel("Email").fill(blockedEmail);
  await page.getByRole("button", { name: "Enviar convite" }).click();
  await expect(page.getByText(/não tem mais vagas de membro/)).toBeVisible();
  await expect(page.getByText(blockedEmail)).toBeHidden();

  // Revogar devolve a vaga.
  await page.getByRole("button", { name: `Revogar convite de ${firstEmail}` }).click();
  await expect(page.getByText("Convite revogado")).toBeVisible();
  await page.getByLabel("Email").fill(blockedEmail);
  await page.getByRole("button", { name: "Enviar convite" }).click();
  await expect(page.getByText("Convite enviado")).toBeVisible();
});
