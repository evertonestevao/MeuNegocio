import { expect, test } from "@playwright/test";
import { createClient, createEmployee, dateFromToday, fillVisit, setupProCompany } from "./business-helpers";

/** Agenda bloqueia conflito; a visita passada vira horas, e fechar o mês lança o gasto. */
test("conflito de agenda, horas sugeridas e fechamento do prestador", async ({ page }) => {
  await setupProCompany(page, "Empresa Agenda E2E");
  await createClient(page, "Fábrica E2E", "Galpão");
  await createEmployee(page, "Marcos Prestador", "pj", "60,00");

  // Ontem pode cair no mês anterior: a tela de horas abre direto no mês da visita.
  const yesterday = dateFromToday(-1);
  const visit = { client: "Fábrica E2E", location: "Galpão", date: yesterday, people: ["Marcos Prestador"] };

  let dialog = await fillVisit(page, { ...visit, start: "08:00", end: "12:00" });
  await dialog.getByRole("button", { name: "Salvar visita" }).click();
  await expect(dialog).toBeHidden();

  // Aviso ao vivo e bloqueio ao salvar.
  dialog = await fillVisit(page, { ...visit, start: "11:00", end: "13:00" });
  await expect(dialog.getByText("Conflito de horário")).toBeVisible();
  await dialog.getByRole("button", { name: "Salvar visita" }).click();
  await expect(dialog.getByText("Marcos Prestador já está em outra visita nesse horário.")).toBeVisible();

  // Encostar não conflita.
  await dialog.getByLabel("Início").fill("12:00");
  await dialog.getByRole("button", { name: "Salvar visita" }).click();
  await expect(dialog).toBeHidden();

  await page.goto(`/dashboard/hours?m=${yesterday.slice(0, 7)}`);
  await expect(page.getByText("não substitui o ponto eletrônico")).toBeVisible();
  // 4 h + 1 h, a R$ 60.
  await expect(page.getByText("R$ 300,00").first()).toBeVisible();

  await page.getByRole("button", { name: "Fechar e pagar" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Fechar e pagar" }).click();
  await expect(page.getByText("Mês fechado e gasto lançado")).toBeVisible();
  await expect(page.getByRole("button", { name: "Fechar e pagar" })).toBeHidden();
  await expect(page.getByRole("button", { name: "Ajustar horas" })).toHaveCount(0);

  // O pagamento entra na data do fechamento, que é hoje, mesmo se as horas forem do mês anterior.
  await page.goto(`/dashboard/expenses?m=${dateFromToday(0).slice(0, 7)}&view=list`);
  const expense = page.locator("main li", { hasText: "Prestação de serviços — Marcos Prestador" });
  await expect(expense).toContainText("R$ 300,00");

  // Excluir o pagamento reabre as horas.
  await expense.getByRole("button", { name: /Excluir/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Excluir" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await page.goto(`/dashboard/hours?m=${yesterday.slice(0, 7)}`);
  await expect(page.getByRole("button", { name: "Fechar e pagar" })).toBeVisible();
});

test("recorrência gera um lançamento por mês, sem duplicar", async ({ page }) => {
  await setupProCompany(page, "Empresa Gastos E2E");
  await page.goto("/dashboard/expenses?tab=recurring");
  await page.getByRole("button", { name: "Nova recorrência" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Descrição").fill("Aluguel do galpão");
  await dialog.getByLabel("Categoria").selectOption({ label: "Aluguel" });
  await dialog.getByLabel("Valor").fill("2.800,00");
  await dialog.getByRole("button", { name: "Salvar recorrência" }).click();
  await expect(dialog).toBeHidden();

  await page.goto("/dashboard/expenses?view=list");
  await page.getByRole("button", { name: "Gerar recorrentes do mês" }).click();
  await expect(page.getByText("1 lançamento(s) gerado(s)")).toBeVisible();
  await expect(page.getByText("R$ 2.800,00").first()).toBeVisible();

  await page.getByRole("button", { name: "Gerar recorrentes do mês" }).click();
  await expect(page.getByText("Nenhum lançamento novo")).toBeVisible();
  await expect(page.locator("main li", { hasText: "Aluguel do galpão" })).toHaveCount(1);
});
