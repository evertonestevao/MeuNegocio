import { expect, test } from "@playwright/test";
import { createClient, setupProCompany } from "./business-helpers";

/** Do catálogo ao faturamento: o cliente aprova pelo link, sem login, e o valor entra no financeiro. */
test("orçamento vai do rascunho ao faturamento pelo link de aprovação", async ({ browser, page }) => {
  await setupProCompany(page, "Empresa Orçamento E2E");
  await createClient(page, "Hotel E2E", "Unidade Centro");

  await page.goto("/dashboard/catalog?kind=service");
  await page.getByRole("button", { name: "Novo serviço" }).click();
  const item = page.getByRole("dialog");
  await item.getByLabel("Nome").fill("Mão de obra E2E");
  await item.getByLabel("Como cobrar").selectOption("hourly");
  await item.getByLabel("Preço por hora").fill("95,00");
  await item.getByLabel("Custo por hora").fill("40,00");
  await item.getByRole("button", { name: "Salvar" }).click();
  await expect(item).toBeHidden();

  await page.goto("/dashboard/quotes/new");
  await page.getByLabel("Cliente").selectOption({ label: "Hotel E2E" });
  await page.getByLabel("Título do serviço").fill("Ampliação elétrica");
  const picker = page.getByLabel("Adicionar do catálogo");
  await picker.selectOption(await picker.locator("option", { hasText: "Mão de obra E2E" }).getAttribute("value") ?? "");
  await page.getByLabel("Horas").fill("10");
  await page.getByLabel("Pessoas").fill("2");
  await page.getByLabel("Desconto").fill("100,00");

  // 10 h × 2 pessoas × R$ 95 − R$ 100.
  await expect(page.getByText("R$ 1.800,00").first()).toBeVisible();
  await page.getByRole("button", { name: "Salvar rascunho" }).click();
  await expect(page).toHaveURL(/\/dashboard\/quotes\/[0-9a-f-]{36}/);
  await expect(page.getByRole("heading", { name: "Orçamento Nº 0001" })).toBeVisible();

  await page.getByRole("button", { name: "Marcar como enviado" }).click();
  await expect(page.getByText("Aguardando o cliente")).toBeVisible();
  const publicLink = await page.getByRole("link", { name: "Ver como o cliente" }).getAttribute("href");
  expect(publicLink).toMatch(/\/orcamento\/[0-9a-f]{64}$/);

  const visitor = await browser.newContext();
  const client = await visitor.newPage();
  await client.goto(new URL(publicLink as string).pathname);
  await expect(client.getByText("Ampliação elétrica")).toBeVisible();
  await expect(client.getByText(/custo|margem/i)).toHaveCount(0);

  await client.getByRole("button", { name: "Aprovar orçamento" }).click();
  await expect(client.getByText("Informe seu nome.")).toBeVisible();
  await client.getByLabel("Seu nome").fill("Renato Cliente");
  await client.getByRole("button", { name: "Aprovar orçamento" }).click();
  await expect(client.getByText("Assine no quadro para aprovar o orçamento.")).toBeVisible();
  const pad = client.getByLabel("Sua assinatura");
  await pad.scrollIntoViewIfNeeded();
  const box = await pad.boundingBox();
  if (!box) throw new Error("quadro de assinatura fora da tela");
  await client.mouse.move(box.x + 30, box.y + 40);
  await client.mouse.down();
  await client.mouse.move(box.x + 120, box.y + 90, { steps: 6 });
  await client.mouse.up();
  await client.getByRole("button", { name: "Aprovar orçamento" }).click();
  await expect(client.getByText(/Orçamento aprovado/)).toBeVisible();
  await visitor.close();

  await page.reload();
  await expect(page.getByText(/Renato Cliente aprovou pelo link/)).toBeVisible();
  await expect(page.getByRole("img", { name: "Assinatura de Renato Cliente" })).toBeVisible();

  // Aprovado, vira serviço em andamento.
  await page.goto("/dashboard/services");
  await expect(page.getByText("#0001 · Ampliação elétrica")).toBeVisible();
  await expect(page.getByRole("button", { name: "Concluir e faturar" })).toBeVisible();
  await page.getByText("#0001 · Ampliação elétrica").click();
  await page.getByRole("button", { name: "Fechar e faturar" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Fechar e faturar" }).click();
  await expect(page.getByText("Faturado")).toBeVisible();

  // Custos do serviço: o gasto lançado aqui entra no resultado e também no caixa do mês.
  await expect(page.getByRole("heading", { name: "Custos e resultado do serviço" })).toBeVisible();
  await page.getByRole("button", { name: "Lançar gasto" }).click();
  const costDialog = page.getByRole("dialog");
  await costDialog.getByLabel("Descrição").fill("Cabos e disjuntores");
  await costDialog.getByLabel("Categoria").selectOption({ index: 1 });
  await costDialog.getByLabel("Valor").fill("300,00");
  await costDialog.getByLabel("Fornecedor").fill("Casa do Eletricista");
  await expect(costDialog.getByText("Fornecedor novo: será cadastrado ao salvar.")).toBeVisible();
  await costDialog.getByLabel("Forma de pagamento").selectOption("pix");
  await expect(costDialog.getByText("Serviço: #0001", { exact: false })).toBeVisible();
  await costDialog.getByRole("button", { name: "Salvar gasto" }).click();
  await expect(costDialog).toBeHidden();
  await expect(page.getByText("Cabos e disjuntores")).toBeVisible();
  await expect(page.getByText("R$ 1.500,00").first()).toBeVisible();

  // O fornecedor digitado virou cadastro, com o que foi pago a ele.
  await page.goto("/dashboard/expenses?tab=suppliers");
  const supplierRow = page.locator("li", { hasText: "Casa do Eletricista" }).first();
  await expect(supplierRow).toContainText("R$ 300,00");
  await expect(supplierRow).toContainText("1 compra");
  await page.goto("/dashboard/expenses?view=list");
  await expect(page.getByText(/Casa do Eletricista · PIX/).first()).toBeVisible();

  await page.goto("/dashboard/services?tab=concluidos");
  await expect(page.getByText("#0001 · Ampliação elétrica")).toBeVisible();
  await expect(page.getByText("R$ 1.500,00").first()).toBeVisible();

  await page.goto("/dashboard/finance");
  await expect(page.getByText("#0001 · Ampliação elétrica")).toBeVisible();
  await expect(page.getByText("cobrado R$ 1.800,00", { exact: false })).toBeVisible();
  await expect(page.getByText("R$ 1.500,00").first()).toBeVisible();

  // Fechado sai do faturamento só por "desfazer".
  await page.getByRole("link", { name: /#0001/ }).click();
  await page.getByRole("button", { name: "Desfazer fechamento" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Desfazer fechamento" }).click();
  await expect(page.getByRole("button", { name: "Fechar e faturar" })).toBeVisible();
  await page.goto("/dashboard/finance");
  await expect(page.getByText("Feche um orçamento aprovado para lançar o faturamento.")).toBeVisible();
});
