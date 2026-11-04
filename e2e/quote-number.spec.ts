import { expect, test } from "@playwright/test";
import { createClient, setupProCompany } from "./business-helpers";
import { admin } from "./reseller-helpers";

/**
 * Empresa com orçamentos e contador de números atrasado (ou sumido): criar um novo dava
 * "Falha ao acessar os orçamentos" por repetir o Nº 0001. Agora pega o próximo livre.
 */
test("orçamento novo não repete número quando o contador da empresa está atrasado", async ({ page }) => {
  const companyName = `Empresa Numeração E2E ${Date.now()}`;
  await setupProCompany(page, companyName);
  await createClient(page, "Cliente Numeração E2E", "Sede");

  const { data: company } = await admin.from("companies").select("id").eq("name", companyName).single();
  const companyId = company!.id as string;
  await admin.from("quotes").insert([
    { company_id: companyId, number: 1, title: "Importado 1" },
    { company_id: companyId, number: 2, title: "Importado 2" },
  ]);
  await admin.from("company_counters").delete().eq("company_id", companyId);

  await page.goto("/dashboard/quotes/new");
  await page.getByLabel("Cliente").selectOption({ label: "Cliente Numeração E2E" });
  await page.getByLabel("Título do serviço").fill("Conserto telhado");
  await page.getByRole("button", { name: "Item avulso" }).click();
  await page.getByLabel("Descrição").first().fill("Mão de obra");
  await page.getByLabel("Valor unitário").first().fill("500,00");
  await page.getByRole("button", { name: "Salvar rascunho" }).click();

  await expect(page.getByText("Falha ao acessar os orçamentos")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Orçamento Nº 0003" })).toBeVisible();
});
