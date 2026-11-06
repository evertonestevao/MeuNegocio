import { expect, test } from "@playwright/test";
import { admin } from "./reseller-helpers";

const OFFICE_ROUTES = [
  "/dashboard",
  "/dashboard/schedule",
  "/dashboard/quotes",
  "/dashboard/quotes/new",
  "/dashboard/services",
  "/dashboard/services?tab=concluidos",
  "/dashboard/clients",
  "/dashboard/catalog",
  "/dashboard/team",
  "/dashboard/hours",
  "/dashboard/expenses",
  "/dashboard/finance",
  "/dashboard/finance/recebimentos",
  "/dashboard/finance/recebimentos?tab=recebidos",
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
  await expect(page.getByText("Demonstração", { exact: false }).first()).toBeVisible();
  await expect(page.locator("main").getByText("Refrigeração Exemplo").first()).toBeVisible();

  for (const route of OFFICE_ROUTES) {
    await page.goto(route);
    await expect(page, route).toHaveURL(new RegExp(route.replace(/[/?.]/g, "\\$&")));
    await expect(page.getByText("Demonstração", { exact: false }).first(), route).toBeVisible();
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
  await expect(page.getByText("Checklist", { exact: true })).toBeVisible();
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
  await expect(page).toHaveURL(/\/comecar$/);
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
  await expect(page.getByText("Demonstração", { exact: false }).first()).toBeVisible();
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

test("assinatura e auditoria ficam dentro de configurações, fora do menu", async ({ page }) => {
  await page.goto("/demo");
  await page.goto("/dashboard/settings");
  const menu = page.getByRole("complementary");
  await expect(menu.getByRole("link", { name: "Assinatura" })).toHaveCount(0);
  await expect(menu.getByRole("link", { name: "Auditoria" })).toHaveCount(0);

  await page.getByRole("link", { name: /Auditoria/ }).click();
  await expect(page.getByRole("heading", { name: "Auditoria" })).toBeVisible();
  await page.getByRole("link", { name: "Configurações" }).last().click();
  await page.getByRole("link", { name: /Assinatura/ }).click();
  await expect(page.getByRole("heading", { name: "Assinatura" })).toBeVisible();
});

test("no celular, tocar em um dia do calendário não volta a página para o topo", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 500 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await page.goto("/demo");
  for (const [path, day] of [["/dashboard/schedule", "de novembro"], ["/dashboard/expenses", "gasto"]] as const) {
    await page.goto(path);
    const days = page.getByRole("link", { name: new RegExp(day === "gasto" ? "gasto\\(s\\)" : "visita\\(s\\)") });
    await days.nth(20).scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollBy(0, 150));
    const before = await page.evaluate(() => window.scrollY);
    expect(before).toBeGreaterThan(0);
    const url = page.url();
    await days.nth(20).tap();
    await page.waitForURL((current) => current.href !== url);
    await page.waitForTimeout(400);
    expect(Math.abs((await page.evaluate(() => window.scrollY)) - before), path).toBeLessThan(5);
  }
  await context.close();
});

test("enviar orçamento pelo WhatsApp na demonstração abre o número comercial", async ({ page }) => {
  await page.goto("/demo");
  await page.goto("/dashboard/quotes?status=sent");
  await page.locator('main a[href^="/dashboard/quotes/"]:not([href$="/new"])').first().click();
  const link = page.locator('main a[href*="wa.me"]', { hasText: "Enviar pelo WhatsApp" });
  await expect(link).toHaveAttribute("href", /^https:\/\/wa\.me\/5514997122258\?text=/);
});

test("o link do orçamento da demonstração abre sem login e não grava a resposta", async ({ browser }) => {
  const count = async () => (await admin.from("quote_responses").select("id", { count: "exact", head: true })).count;
  const before = await count();
  // Sessão nova: é como o cliente abre o link recebido.
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/orcamento/demonstracao-0004");
  await expect(page.getByText("orçamento de demonstração")).toBeVisible();
  await expect(page.getByText("Orçamento Nº 0004")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Refrigeração Exemplo" })).toBeVisible();
  await page.getByLabel(/nome/i).first().fill("Cliente de teste");
  const pad = page.getByLabel("Sua assinatura");
  await pad.scrollIntoViewIfNeeded();
  const box = await pad.boundingBox();
  if (!box) throw new Error("quadro de assinatura fora da tela");
  await page.mouse.move(box.x + 30, box.y + 40);
  await page.mouse.down();
  await page.mouse.move(box.x + 120, box.y + 90, { steps: 6 });
  await page.mouse.up();
  await page.getByRole("button", { name: /Aprovar/ }).click();
  const confirm = page.getByRole("dialog").getByRole("button", { name: /Aprovar|Confirmar/ });
  if (await confirm.isVisible().catch(() => false)) await confirm.click();
  await expect(page.getByText("Na demonstração não é possível salvar")).toBeVisible();
  expect(await count()).toBe(before);

  const unknown = await page.goto("/orcamento/demonstracao-9999");
  expect(unknown?.status()).toBe(404);
  await context.close();
});
