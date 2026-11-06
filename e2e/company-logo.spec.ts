import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { createClient, setupProCompany } from "./business-helpers";
import { admin } from "./reseller-helpers";

const LOGO = { name: "logo.png", mimeType: "image/png", buffer: readFileSync("public/demo/logo-refrigeracao-exemplo.png") };

async function logoPathOf(companyName: string): Promise<string | null> {
  const { data: company } = await admin.from("companies").select("id").eq("name", companyName).order("created_at", { ascending: false }).limit(1).single();
  const { data } = await admin.from("company_profiles").select("logo_path").eq("company_id", company!.id).maybeSingle();
  return data?.logo_path ?? null;
}

/** O logo enviado em Configurações aparece no link que o cliente recebe; removido, some de lá. */
test("logo da empresa: envia, aparece no link do orçamento e remove", async ({ browser, page }) => {
  await setupProCompany(page, "Empresa Logo E2E");
  await createClient(page, "Cliente Logo E2E", "Sede");

  await page.goto("/dashboard/settings");
  await page.getByLabel("Arquivo do logo").setInputFiles(LOGO);
  await expect(page.getByRole("button", { name: "Trocar logo" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Logo da empresa" })).toBeVisible();
  const path = await logoPathOf("Empresa Logo E2E");
  expect(path).toMatch(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.png$/);

  // Arquivo que não é imagem é recusado no aparelho, antes de subir.
  await page.getByLabel("Arquivo do logo").setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: Buffer.from("<svg onload=alert(1)>") });
  await expect(page.getByText("Envie o logo em PNG, JPG ou WebP.")).toBeVisible();
  expect(await logoPathOf("Empresa Logo E2E")).toBe(path);

  await page.goto("/dashboard/quotes/new");
  await page.getByLabel("Cliente").selectOption({ label: "Cliente Logo E2E" });
  await page.getByLabel("Título do serviço").fill("Serviço com logo");
  await page.getByRole("button", { name: "Item avulso" }).click();
  await page.getByLabel("Descrição").last().fill("Visita técnica");
  await page.getByLabel("Valor unitário").last().fill("150,00");
  await page.getByRole("button", { name: "Salvar rascunho" }).click();
  await expect(page).toHaveURL(/\/dashboard\/quotes\/[0-9a-f-]{36}/);
  await page.getByRole("button", { name: "Marcar como enviado" }).click();
  const publicLink = await page.getByRole("link", { name: "Ver como o cliente" }).getAttribute("href");

  const visitor = await (await browser.newContext()).newPage();
  await visitor.goto(new URL(publicLink as string).pathname);
  const logo = visitor.getByRole("img", { name: "Logo da Empresa Logo E2E" });
  await expect(logo).toBeVisible();
  // A imagem carrega de verdade, sem sessão: o bucket é público.
  expect(await logo.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);

  await page.goto("/dashboard/settings");
  await page.getByRole("button", { name: "Remover", exact: true }).click();
  await expect(page.getByRole("button", { name: "Enviar logo" })).toBeVisible();
  expect(await logoPathOf("Empresa Logo E2E")).toBeNull();
  await visitor.reload();
  await expect(visitor.getByRole("img", { name: "Logo da Empresa Logo E2E" })).toHaveCount(0);
});
