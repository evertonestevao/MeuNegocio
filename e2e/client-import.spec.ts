import { expect, test } from "@playwright/test";
import { PASSWORD, signupAndOnboard, uniqueEmail } from "./helpers";

// Como o Excel em português salva: ";" e acento em Windows-1252.
function excelCsv(lines: string[]): Buffer {
  return Buffer.from(lines.join("\r\n"), "latin1");
}

test("importa clientes de uma planilha, com prévia e sem duplicar", async ({ page }) => {
  await signupAndOnboard(page, { email: uniqueEmail("importa"), password: PASSWORD, name: "Dona Importa", company: "Empresa Importa E2E" });

  await page.goto("/dashboard/clients");
  await page.getByRole("button", { name: "Novo cliente" }).click();
  await page.getByLabel("Nome", { exact: true }).fill("Cerâmica Vale Verde");
  await page.getByRole("button", { name: "Salvar cliente" }).click();
  await expect(page).toHaveURL(/\/dashboard\/clients\/[0-9a-f-]{36}/);

  await page.goto("/dashboard/clients");
  await page.getByText("Importar planilha").first().click();
  await expect(page.getByRole("heading", { name: "Importar clientes" })).toBeVisible();
  const template = page.waitForEvent("download");
  await page.getByRole("button", { name: "Baixar modelo" }).click();
  expect((await template).suggestedFilename()).toBe("modelo-clientes.csv");

  await page.getByLabel("Planilha de clientes").setInputFiles({
    name: "clientes.csv",
    mimeType: "text/csv",
    buffer: excelCsv([
      "Razão Social;CNPJ;Celular;E-mail;Responsável;Endereço;Nº;Bairro;Cidade;UF;CEP;Aniversário",
      "Padaria Pão Dourado;11.444.777/0001-61;14999990000;contato@padaria.com;João Silva;Rua das Flores;120;Centro;Bauru;SP;17010000;12/03",
      "Açougue São José;;(14) 3333-1000;;;;;;;;;",
      "Cerâmica Vale Verde;;;;;;;;;;;",
      "Davi;;999;;;;;;;;;",
      "Mercearia Só Cidade;;;;;;;;Lins;SP;;",
      "Eva;111.444.777-00;;;;;;;;;;",
    ]),
  });

  await expect(page.getByText("3 clientes prontos · 3 linhas ficam de fora")).toBeVisible();
  await expect(page.getByText(/Colunas usadas: Razão Social \(Nome\), CNPJ \(CPF\/CNPJ\)/)).toBeVisible();
  await expect(page.getByText("Ficam de fora:")).toBeVisible();
  await expect(page.getByText(/Aniversário\. Para entrarem/)).toBeVisible();
  await expect(page.getByText("Telefone sem DDD ou incompleto.")).toBeVisible();
  await expect(page.getByText("Cliente com este nome já cadastrado.")).toBeVisible();
  await expect(page.getByText("CPF inválido. Confira os números.")).toBeVisible();
  await page.getByRole("button", { name: "Importar 3 clientes" }).click();

  await expect(page).toHaveURL(/\/dashboard\/clients$/);
  await expect(page.getByText("3 clientes importados.")).toBeVisible();
  await expect(page.getByText("Açougue São José").first()).toBeVisible();
  await page.getByRole("link", { name: /Padaria Pão Dourado/ }).first().click();
  await expect(page).toHaveURL(/\/dashboard\/clients\/[0-9a-f-]{36}/);
  await expect(page.getByText("João Silva")).toBeVisible();
  await expect(page.getByText("Rua das Flores, 120 - Centro, Bauru/SP - CEP 17010-000")).toBeVisible();

  // Busca sem acento, pelo documento sem pontuação e pelo telefone.
  for (const [search, found] of [
    ["acougue sao jose", "Açougue São José"],
    ["11444777000161", "Padaria Pão Dourado"],
    ["3333-1000", "Açougue São José"],
    ["mercearia so", "Mercearia Só Cidade"],
  ]) {
    await page.goto(`/dashboard/clients?q=${encodeURIComponent(search)}`);
    await expect(page.getByText(found).first()).toBeVisible();
    await expect(page.getByText("Nenhum cliente encontrado")).toHaveCount(0);
  }
});
