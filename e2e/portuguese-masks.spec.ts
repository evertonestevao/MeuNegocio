import { expect, test } from "@playwright/test";
import { PASSWORD, signupAndOnboard, uniqueEmail } from "./helpers";
import { makeSuperAdmin } from "./reseller-helpers";

// Palavras que já apareceram em inglês na tela. Código técnico (a.b) também não pode aparecer.
const ENGLISH = /\b(Owner|Admin|Member|Billing|Seats?|Enterprise|Free|Status|Email|Dashboard|Gateway|Webhook|Fake|Checkout|Override|canceled|trialing|past_due|active)\b|\b[a-z_]+\.(created|updated|deleted|activated|canceled|invited|started|completed)\b/;

test("as telas do proprietário não mostram inglês", async ({ page }) => {
  test.setTimeout(180_000);
  const email = uniqueEmail("portugues");
  await signupAndOnboard(page, { email, password: PASSWORD, name: "Dono Português", company: "Empresa Português E2E" });
  await makeSuperAdmin(email);

  // Gera dados na trilha, para a auditoria não ficar vazia.
  await page.goto("/dashboard/billing");
  await page.getByRole("button", { name: "Ativar (teste)" }).first().click();
  await expect(page.getByText("assinatura ativa")).toBeVisible();

  const routes = [
    "/", "/login", "/signup", "/forgot-password", "/terms", "/privacy", "/refund",
    "/dashboard", "/dashboard/schedule", "/dashboard/quotes", "/dashboard/quotes/new", "/dashboard/clients",
    "/dashboard/catalog", "/dashboard/team", "/dashboard/hours", "/dashboard/expenses", "/dashboard/finance",
    "/dashboard/members", "/dashboard/billing", "/dashboard/audit", "/dashboard/settings", "/admin/planos", "/admin/revendedores",
  ];
  const found: string[] = [];
  for (const route of routes) {
    await page.goto(route);
    const match = (await page.locator("body").innerText()).match(ENGLISH);
    if (match) found.push(`${route}: ${match[0]}`);
  }
  expect(found).toEqual([]);

  // A tela padrão do Next, para endereço inexistente, seria em inglês.
  await page.goto("/pagina-que-nao-existe");
  await expect(page.getByRole("heading", { name: "Página não encontrada" })).toBeVisible();
});

test("CNPJ, CPF, telefone e valor ganham máscara ao digitar e ao salvar", async ({ page }) => {
  await signupAndOnboard(page, {
    email: uniqueEmail("mascaras"),
    password: PASSWORD,
    name: "Dono Máscaras",
    company: "Empresa Máscaras E2E",
  });

  await page.goto("/dashboard/settings");
  // Foto de perfil desligada: o único envio de imagem é o logo, com botão em português.
  await expect(page.getByText("Nenhuma foto escolhida")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Enviar logo" })).toBeVisible();

  const cnpj = page.getByLabel("CNPJ");
  await cnpj.pressSequentially("11222333000181");
  await expect(cnpj).toHaveValue("11.222.333/0001-81");
  const phone = page.getByLabel("Telefone");
  await phone.pressSequentially("14999990000");
  await expect(phone).toHaveValue("(14) 99999-0000");

  // Número incompleto é recusado, mesmo com a máscara.
  await cnpj.fill("112223");
  await page.getByRole("button", { name: "Salvar dados" }).click();
  await expect(page.getByText("Informe o CNPJ com 14 dígitos.")).toBeVisible();

  await page.goto("/dashboard/clients");
  await page.getByRole("button", { name: "Novo cliente" }).or(page.getByRole("link", { name: "Novo cliente" })).click();
  const document = page.getByLabel("CNPJ ou CPF");
  await document.pressSequentially("52998224725");
  await expect(document).toHaveValue("529.982.247-25");
  await document.fill("");
  await document.pressSequentially("11222333000181");
  await expect(document).toHaveValue("11.222.333/0001-81");

  await page.goto("/dashboard/expenses");
  await page.getByRole("button", { name: "Novo gasto" }).click();
  const amount = page.getByLabel(/^Valor/);
  await amount.pressSequentially("1500");
  await expect(amount).toHaveValue("1.500");
  await amount.blur();
  await expect(amount).toHaveValue("1.500,00");
});
