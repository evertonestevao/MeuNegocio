import { expect, test } from "@playwright/test";
import { PASSWORD, signupAndOnboard, uniqueEmail } from "./helpers";
import { admin } from "./reseller-helpers";

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
  await page.getByLabel("E-mail").fill(invitedEmail);
  await page.getByLabel("Papel").selectOption("member");
  await page.getByRole("button", { name: "Enviar convite" }).click();

  await expect(page.getByText("Convite enviado")).toBeVisible();
  await expect(page.getByText(invitedEmail)).toBeVisible();

  // revogação
  await page.getByRole("button", { name: `Revogar convite de ${invitedEmail}` }).click();
  await expect(page.getByText("Convite revogado")).toBeVisible();
  await expect(page.getByText(invitedEmail)).toBeHidden();
});

test("plano sem membro extra recusa o convite quando as vagas acabam", async ({ page }) => {
  const company = `Empresa Vagas E2E ${Date.now()}`;
  await signupAndOnboard(page, {
    email: uniqueEmail("owner-free"),
    password: PASSWORD,
    name: "Owner Free E2E",
    company,
  });
  // A empresa começa no teste do plano completo; aqui ela vai para um plano de 2 vagas que não
  // vende membro extra (o Free), que é a regra testada.
  const { data: created } = await admin.from("companies").select("id").eq("name", company).single();
  const { data: free } = await admin.from("plans").select("id").eq("code", "free").single();
  await admin.from("subscriptions").update({ plan_id: free!.id, contracted_extra_seat_price_cents: 0 }).eq("company_id", created!.id).is("deleted_at", null);
  await page.goto("/dashboard/members");

  // Owner + este convite ocupam as 2 vagas.
  const firstEmail = uniqueEmail("primeiro");
  await page.getByLabel("E-mail").fill(firstEmail);
  await page.getByRole("button", { name: "Enviar convite" }).click();
  await expect(page.getByText("Convite enviado")).toBeVisible();

  const blockedEmail = uniqueEmail("sem-vaga");
  await page.getByLabel("E-mail").fill(blockedEmail);
  await page.getByRole("button", { name: "Enviar convite" }).click();
  await expect(page.getByText(/não tem mais vagas de membro/)).toBeVisible();
  await expect(page.getByText(blockedEmail)).toBeHidden();

  // Revogar devolve a vaga.
  await page.getByRole("button", { name: `Revogar convite de ${firstEmail}` }).click();
  await expect(page.getByText("Convite revogado")).toBeVisible();
  await page.getByLabel("E-mail").fill(blockedEmail);
  await page.getByRole("button", { name: "Enviar convite" }).click();
  await expect(page.getByText("Convite enviado")).toBeVisible();
});
