import { expect, test } from "@playwright/test";
import { createClient, setupProCompany } from "./business-helpers";

/** O escritório registra a decisão em nome do cliente, cancela e tudo fica no histórico do orçamento. */
test("aprovação por telefone com quem autorizou, cancelamento com motivo e histórico", async ({ page, browser }) => {
  await setupProCompany(page, "Empresa Histórico E2E");
  await createClient(page, "Condomínio Histórico", "Portaria");

  await page.goto("/dashboard/quotes/new");
  await page.getByLabel("Cliente", { exact: true }).selectOption({ label: "Condomínio Histórico" });
  await page.getByLabel("Título do serviço").fill("Troca do quadro da portaria");
  await page.getByRole("button", { name: "Item avulso" }).click();
  await page.locator("#line-0-description").fill("Quadro de distribuição");
  await page.locator("#line-0-price").fill("900,00");
  await page.getByRole("button", { name: "Salvar rascunho" }).click();
  await expect(page).toHaveURL(/\/dashboard\/quotes\/[0-9a-f-]{36}/);
  await page.getByRole("button", { name: "Marcar como enviado" }).click();
  await expect(page.getByText("O cliente ainda não abriu o link.")).toBeVisible();
  const link = await page.getByRole("link", { name: "Ver como o cliente" }).getAttribute("href");

  // Aprovação por telefone: quem autorizou é obrigatório.
  await page.getByRole("button", { name: "Cliente aprovou" }).click();
  const approve = page.getByRole("dialog");
  await approve.getByRole("button", { name: "Registrar aprovação" }).click();
  await expect(approve).toBeVisible();
  await approve.getByLabel("Quem autorizou").fill("Sr. Osvaldo, síndico");
  await approve.getByLabel("Observação (opcional)").fill("Aprovou por telefone");
  await approve.getByRole("button", { name: "Registrar aprovação" }).click();
  await expect(page.getByText("Aprovado", { exact: true }).first()).toBeVisible();

  // Cancelamento depois de aprovado: pede quem pediu e o motivo.
  await page.getByRole("button", { name: "Cancelar orçamento" }).click();
  const cancel = page.getByRole("dialog");
  await cancel.getByLabel("Quem pediu o cancelamento").fill("Sr. Osvaldo, síndico");
  await cancel.getByLabel("Motivo").fill("A assembleia adiou a obra");
  await cancel.getByRole("button", { name: "Cancelar orçamento" }).click();
  await expect(page.getByText("Cancelado", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/cancelado em \d{2}\/\d{2}\/\d{4}/)).toBeVisible();

  const history = page.getByRole("region", { name: "Histórico do orçamento" });
  await expect(history.getByText("Orçamento cancelado")).toBeVisible();
  await expect(history.getByText("Quem pediu o cancelamento: Sr. Osvaldo, síndico")).toBeVisible();
  await expect(history.getByText("Motivo: A assembleia adiou a obra")).toBeVisible();
  await expect(history.getByText("Quem autorizou: Sr. Osvaldo, síndico")).toBeVisible();
  await expect(history.getByText("Observação: Aprovou por telefone")).toBeVisible();
  await expect(history.getByText("Orçamento enviado")).toBeVisible();
  await expect(history.getByText("Orçamento criado")).toBeVisible();

  // Na lista, o filtro Cancelado; no link, o cliente vê que foi cancelado.
  await page.goto("/dashboard/quotes?status=canceled");
  await expect(page.getByText("Troca do quadro da portaria")).toBeVisible();
  const visitor = await browser.newContext();
  const client = await visitor.newPage();
  await client.goto(new URL(link!).pathname);
  await expect(client.getByText(/Este orçamento foi cancelado/)).toBeVisible();
  await visitor.close();
});
