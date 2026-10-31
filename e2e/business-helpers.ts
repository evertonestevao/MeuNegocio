import { expect, type Page } from "@playwright/test";
import { PASSWORD, signupAndOnboard, uniqueEmail } from "./helpers";

/** Empresa nova, já no plano com link de aprovação, ordem de serviço e horas. */
export async function setupProCompany(page: Page, company: string) {
  await signupAndOnboard(page, {
    email: uniqueEmail("dono"),
    password: PASSWORD,
    name: "Dona Negócio",
    company,
  });
  await page.goto("/dashboard/billing");
  await page.getByRole("button", { name: "Ativar (teste)" }).first().click();
  await expect(page.getByText("assinatura ativa")).toBeVisible();
}

export async function createClient(page: Page, name: string, locationName: string) {
  await page.goto("/dashboard/clients");
  await page.getByRole("button", { name: "Novo cliente" }).click();
  await page.getByLabel("Nome", { exact: true }).fill(name);
  await page.getByRole("button", { name: "Salvar cliente" }).click();
  await expect(page).toHaveURL(/\/dashboard\/clients\/[0-9a-f-]{36}/);

  await page.getByRole("button", { name: "Adicionar" }).nth(1).click();
  await page.getByLabel("Nome do local").fill(locationName);
  await page.getByLabel("Endereço completo").fill("Rua das Oficinas, 45 — Bauru/SP");
  await page.getByRole("button", { name: "Salvar local" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByText("Rua das Oficinas, 45")).toBeVisible();
}

export async function createEmployee(page: Page, name: string, contract: "clt" | "pj", hourlyPay = "") {
  await page.goto("/dashboard/team");
  await page.getByRole("button", { name: "Nova pessoa" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nome").fill(name);
  await dialog.getByLabel("Contrato").selectOption(contract);
  if (hourlyPay) await dialog.getByLabel("Valor pago por hora").fill(hourlyPay);
  await dialog.getByRole("button", { name: "Salvar" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(name)).toBeVisible();
}

/** Abre o diálogo de nova visita, já preenchido, sem salvar. */
export async function fillVisit(
  page: Page,
  visit: { client: string; location: string; date: string; start: string; end: string; people: string[] },
) {
  await page.goto(`/dashboard/schedule?d=${visit.date}`);
  await page.getByRole("button", { name: "Nova visita", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Cliente").selectOption({ label: visit.client });
  await dialog.getByLabel("Local", { exact: true }).selectOption({ label: visit.location });
  await dialog.getByLabel("Data").fill(visit.date);
  await dialog.getByLabel("Início").fill(visit.start);
  await dialog.getByLabel("Término").fill(visit.end);
  for (const person of visit.people) await dialog.getByText(person, { exact: true }).click();
  return dialog;
}

/** Data de hoje mais n dias, no formato do campo. */
export function dateFromToday(days: number): string {
  const value = new Date(Date.now() + days * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(value);
}
