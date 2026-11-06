import { expect, test, type Page } from "@playwright/test";
import { createClient } from "./business-helpers";
import { PASSWORD, signupUntilSubscribe, uniqueEmail } from "./helpers";
import { admin, makeSuperAdmin } from "./reseller-helpers";

/** Último passo com CNPJ: a base de testes (COMPANY_REGISTRY=fake) conhece 11.222.333/0001-81. */
async function finishWithCnpj(page: Page, company: string, cnpj: string) {
  await expect(page).toHaveURL(/\/onboarding/);
  await page.getByLabel("Nome da empresa").fill(company);
  await page.getByLabel("Telefone ou WhatsApp").fill("(14) 99999-0000");
  await page.locator("#profile-cnpj").fill(cnpj);
  await page.getByRole("button", { name: "Concluir e entrar no sistema" }).click();
  // Sem a declaração, não segue.
  await expect(page).toHaveURL(/\/onboarding/);
  await page.getByRole("checkbox", { name: /Declaro que sou responsável/ }).check();
  await page.getByRole("button", { name: "Concluir e entrar no sistema" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

async function companyIdOf(name: string): Promise<string> {
  const { data } = await admin.from("companies").select("id").eq("name", name).order("created_at", { ascending: false }).limit(1).single();
  return data!.id;
}

test("declaração, conferência do CNPJ, denúncia e suspensão ficam guardadas como prova", async ({ browser, page }) => {
  const stamp = Date.now();
  const honest = `Exemplo Refrigeração ${stamp}`;
  const impostor = `Padaria Golpe ${stamp}`;

  // Dona de verdade: nome confere com a razão social e ela está no quadro de sócios.
  await signupUntilSubscribe(page, { email: uniqueEmail("dona"), password: PASSWORD, name: "Ana Lima" });
  await page.getByRole("button", { name: "Começar agora: 7 dias grátis" }).click();
  await finishWithCnpj(page, honest, "11.222.333/0001-81");

  // CNPJ com dígito errado é recusado antes de gravar.
  const other = await (await browser.newContext()).newPage();
  await signupUntilSubscribe(other, { email: uniqueEmail("golpe"), password: PASSWORD, name: "Bruno Souza" });
  await other.getByRole("button", { name: "Começar agora: 7 dias grátis" }).click();
  await expect(other).toHaveURL(/\/onboarding/);
  await other.getByLabel("Nome da empresa").fill(impostor);
  await other.getByLabel("Telefone ou WhatsApp").fill("(14) 98888-0000");
  await other.locator("#profile-cnpj").fill("11.222.333/0001-80");
  await other.getByRole("checkbox", { name: /Declaro que sou responsável/ }).check();
  await other.getByRole("button", { name: "Concluir e entrar no sistema" }).click();
  await expect(other.getByText("CNPJ inválido. Confira os números.")).toBeVisible();
  // Com o CNPJ de outra empresa: entra, mas fica sinalizado.
  await other.locator("#profile-cnpj").fill("11.222.333/0001-81");
  await other.getByRole("button", { name: "Concluir e entrar no sistema" }).click();
  await expect(other).toHaveURL(/\/dashboard/);

  const honestId = await companyIdOf(honest);
  const impostorId = await companyIdOf(impostor);
  const { data: declarations } = await admin.from("company_declarations").select("*").eq("company_id", impostorId);
  expect(declarations).toHaveLength(1);
  expect(declarations![0]).toMatchObject({ user_name: "Bruno Souza", company_name: impostor, cnpj: "11.222.333/0001-81" });
  expect(declarations![0].statement).toMatch(/^Declaro que sou responsável/);
  expect(declarations![0].ip_address).not.toBeNull();
  const { data: honestCheck } = await admin.from("company_cnpj_checks").select("*").eq("company_id", honestId).single();
  expect(honestCheck).toMatchObject({ result: "match", declarant_in_partners: true, official_name: "EMPRESA EXEMPLO SERVICOS LTDA" });
  const { data: impostorCheck } = await admin.from("company_cnpj_checks").select("*").eq("company_id", impostorId).single();
  expect(impostorCheck).toMatchObject({ result: "name_mismatch", declarant_in_partners: false });

  // O cliente recebe o orçamento do impostor e denuncia pelo link.
  await createClient(other, "Cliente Enganado", "Casa");
  await other.goto("/dashboard/quotes/new");
  await other.getByLabel("Cliente").selectOption({ label: "Cliente Enganado" });
  await other.getByRole("button", { name: "Item avulso" }).click();
  await other.getByLabel("Descrição").last().fill("Sinal do serviço");
  await other.getByLabel("Valor unitário").last().fill("500,00");
  await other.getByRole("button", { name: "Salvar rascunho" }).click();
  await other.getByRole("button", { name: "Marcar como enviado" }).click();
  const link = new URL((await other.getByRole("link", { name: "Ver como o cliente" }).getAttribute("href")) as string).pathname;

  const client = await (await browser.newContext()).newPage();
  await client.goto(link);
  await client.getByRole("link", { name: "Denunciar uso indevido" }).click();
  await expect(client.getByText(`Empresa: ${impostor}`)).toBeVisible();
  await client.getByLabel("O que aconteceu?").fill("Pediram PIX adiantado para uma conta de pessoa física.");
  await client.getByLabel("E-mail ou telefone para contato").fill("cliente@e2e.local");
  await client.getByRole("button", { name: "Enviar denúncia" }).click();
  await expect(client.getByText(/Denúncia recebida/)).toBeVisible();
  const { data: reports } = await admin.from("abuse_reports").select("*").eq("company_id", impostorId);
  expect(reports).toHaveLength(1);
  expect(reports![0].quote_id).not.toBeNull();

  // Super admin vê os sinais, abre os comprovantes e suspende.
  const adminEmail = uniqueEmail("super");
  await admin.auth.admin.createUser({ email: adminEmail, password: PASSWORD, email_confirm: true, user_metadata: { full_name: "Super Admin" } });
  await makeSuperAdmin(adminEmail);
  const boss = await (await browser.newContext()).newPage();
  await boss.goto("/login");
  await boss.getByLabel("E-mail").fill(adminEmail);
  await boss.getByLabel("Senha").fill(PASSWORD);
  await boss.getByRole("button", { name: "Entrar" }).click();
  await boss.waitForURL((url) => !url.pathname.startsWith("/login"));
  await boss.goto("/admin/empresas");
  // Conta nova: aceita os termos vigentes antes da área de administração.
  if (boss.url().includes("accept-terms")) {
    await boss.getByRole("checkbox", { name: /Li e aceito/ }).check();
    await boss.getByRole("button", { name: "Aceitar e continuar" }).click();
    await boss.waitForURL((url) => !url.pathname.includes("accept-terms"));
    await boss.goto("/admin/empresas");
  }
  const row = boss.locator("li", { hasText: impostor });
  await expect(row.getByText("Nome não confere com o CNPJ")).toBeVisible();
  await expect(row.getByText("Fora do quadro de sócios")).toBeVisible();
  await expect(row.getByText("1 denúncia")).toBeVisible();
  await row.getByRole("link", { name: impostor }).click();
  await expect(boss.getByText("Bruno Souza", { exact: false }).first()).toBeVisible();
  await expect(boss.getByText("Pediram PIX adiantado", { exact: false })).toBeVisible();
  await boss.getByLabel("Motivo da suspensão").fill("Denúncia de cliente e CNPJ de outra empresa.");
  await boss.getByRole("button", { name: "Suspender empresa" }).click();
  await expect(boss.getByText("Empresa suspensa", { exact: true })).toBeVisible();

  // Suspensa: o impostor não entra no painel e o link não abre mais.
  await other.goto("/dashboard");
  await expect(other).toHaveURL(/\/empresa-suspensa/);
  await expect(other.getByRole("heading", { name: "Acesso suspenso" })).toBeVisible();
  const blocked = await client.goto(link);
  expect(blocked?.status()).toBe(404);

  // Reativar também exige motivo e fica no histórico.
  await boss.reload();
  await boss.getByLabel("Motivo da reativação").fill("Apuração concluída.");
  await boss.getByRole("button", { name: "Reativar empresa" }).click();
  await expect(boss.getByText("Empresa reativada", { exact: true })).toBeVisible();
  const { data: events } = await admin.from("company_suspension_events").select("action, actor_email").eq("company_id", impostorId).order("created_at");
  expect(events).toEqual([
    { action: "suspended", actor_email: adminEmail },
    { action: "reactivated", actor_email: adminEmail },
  ]);
  await other.goto("/dashboard");
  await expect(other).toHaveURL(/\/dashboard$/);
});

test("denúncia pelo site, sem link de orçamento", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Denunciar uso indevido" }).click();
  await page.getByLabel("Nome ou CNPJ da empresa denunciada").fill("Empresa Que Usa Meu Nome");
  await page.getByLabel("O que aconteceu?").fill("Estão mandando orçamento com o meu logo e o meu CNPJ.");
  await page.getByLabel("E-mail ou telefone para contato").fill("dono@e2e.local");
  await page.getByRole("button", { name: "Enviar denúncia" }).click();
  await expect(page.getByText(/Denúncia recebida/)).toBeVisible();
  const { data } = await admin.from("abuse_reports").select("company_id, company_name").eq("reporter_contact", "dono@e2e.local").order("created_at", { ascending: false }).limit(1).single();
  expect(data).toEqual({ company_id: null, company_name: "Empresa Que Usa Meu Nome" });
});
