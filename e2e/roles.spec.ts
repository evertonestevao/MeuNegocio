import { expect, test } from "@playwright/test";
import { PASSWORD, signupAndOnboard, uniqueEmail } from "./helpers";

/**
 * Regressão: quem entra por convite precisa receber o próprio papel, e não o da primeira linha
 * da empresa. A RLS mostra os colegas, então um member chegou a ser tratado como owner.
 */
test("member convidado não recebe os poderes do owner", async ({ browser }) => {
  const ownerContext = await browser.newContext();
  const owner = await ownerContext.newPage();
  await signupAndOnboard(owner, {
    email: uniqueEmail("dono"),
    password: PASSWORD,
    name: "Dona Papéis",
    company: "Empresa Papéis E2E",
  });

  const memberEmail = uniqueEmail("membro");
  const memberContext = await browser.newContext();
  const member = await memberContext.newPage();
  await signupAndOnboard(member, {
    email: memberEmail,
    password: PASSWORD,
    name: "Membro Papéis",
    company: "Empresa Própria E2E",
  });

  await owner.goto("/dashboard/members");
  await owner.getByLabel("E-mail").fill(memberEmail);
  await owner.getByLabel("Papel").selectOption("member");
  await owner.getByRole("button", { name: "Enviar convite" }).click();
  await expect(owner.getByText("Convite enviado")).toBeVisible();

  await member.goto("/dashboard/settings");
  await member.getByRole("button", { name: /Aceitar/ }).click();
  await expect(member.getByRole("button", { name: /Aceitar/ })).toBeHidden();

  await member.getByRole("button", { name: /Empresa Própria E2E/ }).click();
  await member.getByRole("menuitem", { name: /Empresa Papéis E2E/ }).click();
  await expect(member.getByRole("button", { name: /Empresa Papéis E2E/ })).toBeVisible();
  await member.goto("/dashboard");
  await expect(member.getByRole("heading", { name: "Empresa Papéis E2E" })).toBeVisible();
  await expect(member.getByText("Membro", { exact: true })).toBeVisible();
  await expect(member.getByRole("link", { name: "Membros", exact: true })).toBeHidden();
  await expect(member.getByRole("link", { name: "Assinatura", exact: true })).toBeHidden();

  await member.goto("/dashboard/catalog");
  await expect(member.getByRole("button", { name: "Novo produto" })).toBeHidden();

  await member.goto("/dashboard/members");
  await expect(member).toHaveURL(/\/dashboard$/);

  await ownerContext.close();
  await memberContext.close();
});
