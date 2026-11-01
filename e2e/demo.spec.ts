import { expect, test } from "@playwright/test";
import { admin } from "./reseller-helpers";

const OFFICE_ROUTES = [
  "/dashboard",
  "/dashboard/schedule",
  "/dashboard/quotes",
  "/dashboard/quotes/new",
  "/dashboard/clients",
  "/dashboard/catalog",
  "/dashboard/team",
  "/dashboard/hours",
  "/dashboard/expenses",
  "/dashboard/finance",
  "/dashboard/members",
  "/dashboard/billing",
  "/dashboard/audit",
  "/dashboard/settings",
];

test("demonstração abre as telas sem login, com dados fictícios e sem erro", async ({ page }) => {
  const errors: string[] = [];
  page.on("response", (response) => {
    if (response.status() >= 500) errors.push(`${response.status()} ${response.url()}`);
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Ver demonstração" }).first().click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText("Você está em uma demonstração")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Refrigeração Exemplo" })).toBeVisible();

  for (const route of OFFICE_ROUTES) {
    await page.goto(route);
    await expect(page, route).toHaveURL(new RegExp(route.replace(/\//g, "\\/")));
    await expect(page.getByText("Você está em uma demonstração"), route).toBeVisible();
  }
  expect(errors).toEqual([]);

  await page.goto("/dashboard/clients");
  await page.getByRole("link", { name: "Padaria Pão Dourado" }).first().click();
  await expect(page.getByText("Carla Mendes").first()).toBeVisible();

  await page.goto("/dashboard/quotes");
  await page.getByRole("link", { name: /Contrato anual de manutenção/ }).click();
  await expect(page.getByRole("heading", { name: /Orçamento/ }).first()).toBeVisible();
  await expect(page.getByText("Manutenção preventiva").or(page.getByRole("textbox").first()).first()).toBeVisible();
});

test("nada do que se tenta na demonstração é gravado", async ({ page }) => {
  const count = async () => (await admin.from("clients").select("id", { count: "exact", head: true })).count;
  const before = await count();

  await page.goto("/demo");
  await page.goto("/dashboard/clients");
  await page.getByRole("button", { name: "Novo cliente" }).or(page.getByRole("link", { name: "Novo cliente" })).click();
  await page.getByLabel("Nome").fill("Não pode gravar");
  await page.getByRole("button", { name: /Salvar|Criar/ }).last().click();
  await expect(page.getByText("Na demonstração não é possível salvar")).toBeVisible();
  await expect(page.getByText("Não pode gravar", { exact: true }).locator("visible=true")).toHaveCount(0);
  expect(await count()).toBe(before);

  await page.goto("/dashboard/billing");
  await page.getByRole("button", { name: "Ativar (teste)" }).first().click();
  await expect(page.getByText("Na demonstração não é possível salvar")).toBeVisible();
});

test("técnico vê as próprias visitas e a ordem de serviço", async ({ page }) => {
  await page.goto("/demo");
  await page.getByRole("link", { name: "Ver como técnico" }).click();
  await expect(page).toHaveURL(/my-visits/);
  await page.getByRole("link", { name: /Padaria Pão Dourado/ }).first().click();
  await expect(page.getByText("Checklist")).toBeVisible();
  await expect(page.getByText("Conferir EPIs")).toBeVisible();
});

test("demonstração não dá acesso a áreas restritas e termina ao sair", async ({ page }) => {
  await page.goto("/demo");
  for (const route of ["/admin/planos", "/admin/revendedores", "/vendedor", "/onboarding"]) {
    await page.goto(route);
    await expect(page, route).toHaveURL(/\/dashboard$/);
  }
  await page.getByRole("link", { name: "Sair", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);

  // Criar conta encerra a demonstração.
  await page.goto("/demo");
  await page.getByRole("link", { name: "Criar minha conta" }).click();
  await expect(page).toHaveURL(/\/signup/);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
});

test("pré-busca de links não encerra a demonstração", async ({ page }) => {
  await page.goto("/demo");
  await page.waitForLoadState("networkidle");
  await page.goto("/dashboard/quotes");
  await page.waitForLoadState("networkidle");
  await page.getByRole("link", { name: "Clientes" }).click();
  await expect(page).toHaveURL(/\/dashboard\/clients/);
  await expect(page.getByText("Você está em uma demonstração")).toBeVisible();
});

test("redirecionamentos não expõem o host interno, atrás de túnel ou proxy", async ({ request }) => {
  const location = async (path: string, headers: Record<string, string> = {}) => {
    const value = (await request.get(path, { maxRedirects: 0, headers })).headers().location;
    return value?.replace("http://localhost:3100", "");
  };
  expect(await location("/demo")).toBe("/dashboard");
  expect(await location("/demo?perfil=tecnico")).toBe("/dashboard/my-visits");
  expect(await location("/demo/sair")).toBe("/");
  expect(await location("/admin/planos", { cookie: "demo_mode=owner" })).toBe("/dashboard");
  expect(await location("/?ref=codigo")).toMatch(/^\/r\//);
});
