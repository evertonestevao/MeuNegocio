import { expect, test } from "@playwright/test";

/** A página inicial vende o produto, com os planos do banco, sem restos do template. */
test("landing mostra o produto, os planos ativos e os dados legais", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("visita técnica");

  const body = await page.locator("body").innerText();
  expect(body).not.toMatch(/starter|template|supabase|next\.js/i);

  const plans = page.locator("#planos");
  await expect(plans.getByText("12x de R$ 329,90")).toBeVisible();
  await expect(plans.getByText("R$ 379,90")).toBeVisible();
  await expect(plans.getByText(/No cartão, total de R\$\s3\.958,80/)).toBeVisible();
  await expect(plans.getByText("Economize R$ 600,00 por ano")).toBeVisible();
  await expect(plans.getByText("Grátis", { exact: true })).toHaveCount(0);
  await expect(plans.getByRole("heading", { name: "Anual" }).or(plans.getByText("Anual", { exact: true }))).toBeVisible();
  await plans.getByRole("button", { name: "Começar com o plano Anual" }).click();
  await expect(page).toHaveURL(/\/signup/);

  await page.goto("/");
  await expect(page.getByRole("contentinfo")).toContainText("CNPJ");
  await page.getByText("Emite nota fiscal?").click();
  await expect(page.getByText(/A nota continua sendo emitida por fora/)).toBeVisible();
});

test("landing mostra telas reais e gráficos avisados como exemplo, sem rolagem lateral no celular", async ({ page }) => {
  await page.goto("/");
  const images = page.locator("main img");
  expect(await images.count()).toBeGreaterThanOrEqual(5);
  await page.locator("#telas").scrollIntoViewIfNeeded();
  for (const image of await images.all()) {
    await image.scrollIntoViewIfNeeded();
    await expect(image).toHaveAttribute("alt", /.{10,}/);
    await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBeGreaterThan(0);
  }
  await expect(page.getByText(/valores abaixo são fictícios/)).toBeVisible();
  await page.getByText("Ver valores em tabela").click();
  await expect(page.getByRole("cell", { name: "Outubro" })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("botões de compra ficam parados e sempre navegam, mesmo clicando logo ao abrir", async ({ page }) => {
  const annual = page.locator("#planos").getByRole("button", { name: "Começar com o plano Anual" });
  for (let attempt = 0; attempt < 8; attempt++) {
    await page.goto("/");
    await annual.click();
    await expect(page).toHaveURL(/\/signup/);
  }
  await page.goto("/");
  const moving = await annual.evaluate((button) => {
    const found: string[] = [];
    for (let element: Element | null = button; element; element = element.parentElement) {
      const style = getComputedStyle(element);
      if (style.animationName !== "none" || (style.transitionProperty.includes("transform") && element !== button)) found.push(element.tagName);
    }
    return found;
  });
  expect(moving).toEqual([]);
});

test("animações respeitam quem pede menos movimento e não escondem o conteúdo", async ({ page }) => {
  await page.goto("/");
  const title = page.getByRole("heading", { level: 1 });
  await expect(title).toHaveCSS("animation-name", "lp-rise");
  await expect(title).toHaveCSS("opacity", "1");
  const card = page.getByRole("heading", { name: "Agenda da equipe" });
  await card.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, 300));
  await expect.poll(() => card.evaluate((element) => Number(getComputedStyle(element.parentElement!).opacity))).toBeGreaterThan(0.9);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(title).toHaveCSS("animation-name", "none");
  await expect(page.locator(".lp-reveal").first()).toHaveCSS("animation-name", "none");
  await expect(page.locator(".lp-grow-y").first()).toHaveCSS("animation-name", "none");
});
