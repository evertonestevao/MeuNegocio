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
  // O que cada coluna é: reconhecido pelo título, e o que não foi reconhecido fica em "Não importar".
  await expect(page.getByLabel(/^Razão Social/)).toHaveValue("name");
  await expect(page.getByLabel(/^Nº/)).toHaveValue("number");
  await expect(page.getByLabel(/^Aniversário/)).toHaveValue("");
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

  // Filtros: tipo pelo CPF/CNPJ e cidade pelo endereço dos locais; a busca também acha pela cidade.
  const names = async () => (await page.locator("main").innerText());
  await page.goto("/dashboard/clients?tipo=pj");
  expect(await names()).toContain("Padaria Pão Dourado");
  expect(await names()).not.toContain("Açougue São José");
  await page.goto("/dashboard/clients?tipo=none");
  expect(await names()).toContain("Açougue São José");
  expect(await names()).not.toContain("Padaria Pão Dourado");
  await page.goto("/dashboard/clients?cidade=bauru");
  expect(await names()).toContain("Padaria Pão Dourado");
  expect(await names()).not.toContain("Mercearia Só Cidade");
  await page.goto(`/dashboard/clients?q=${encodeURIComponent("lins")}`);
  await expect(page.getByText("Mercearia Só Cidade").first()).toBeVisible();
  await page.goto("/dashboard/clients?cidade=cidade-que-nao-existe");
  await expect(page.getByText("Nenhum cliente encontrado")).toBeVisible();
});

test("planilha com títulos diferentes: a pessoa escolhe o que cada coluna é", async ({ page }) => {
  await signupAndOnboard(page, { email: uniqueEmail("colunas"), password: PASSWORD, name: "Dona Colunas", company: "Empresa Colunas E2E" });
  await page.goto("/dashboard/clients/importar");
  await page.getByLabel("Planilha de clientes").setInputFiles({
    name: "clientes.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(["Razão do freguês;Fone do cliente;Município", "Mercearia do Zé;14 3333-1000;Lins"].join("\r\n"), "utf8"),
  });
  await expect(page.getByText("Escolha acima qual coluna tem o nome do cliente.")).toBeVisible();
  await expect(page.getByRole("button", { name: /Importar/ })).toBeDisabled();

  await page.getByLabel(/^Razão do freguês/).selectOption("name");
  await page.getByLabel(/^Fone do cliente/).selectOption("phone");
  await expect(page.getByText("1 cliente pronto")).toBeVisible();
  await page.getByRole("button", { name: "Importar 1 cliente" }).click();
  await expect(page.getByText("1 cliente importado.")).toBeVisible();
  await page.getByRole("link", { name: /Mercearia do Zé/ }).first().click();
  await expect(page.getByText("(14) 3333-1000").first()).toBeVisible();
  await expect(page.getByText("Lins", { exact: true }).first()).toBeVisible();
});
