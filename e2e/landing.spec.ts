import { expect, test } from "@playwright/test";

/** A página inicial vende o produto, com contato pelo WhatsApp, sem restos do template. */
test("landing mostra o produto, o contato pelo WhatsApp e os dados legais", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("visita técnica");

  const body = await page.locator("body").innerText();
  expect(body).not.toMatch(/starter|template|supabase|next\.js/i);

  // Sem preços por enquanto: a contratação é pelo WhatsApp comercial.
  // Os gráficos de exemplo têm valores em reais; preço de plano, não.
  for (const price of ["329,90", "379,90", "3.958,80", "/mês"]) expect(body).not.toContain(price);
  await expect(page.locator("#planos")).toHaveCount(0);
  const contact = page.locator("#contato").getByRole("button", { name: "Falar pelo WhatsApp" });
  await expect(contact).toHaveAttribute("href", /^https:\/\/wa\.me\/5514997122258\?text=/);

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

test("o botão de contato fica parado e leva ao WhatsApp, mesmo clicando logo ao abrir", async ({ page }) => {
  const contact = page.locator("#contato").getByRole("button", { name: "Falar pelo WhatsApp" });
  await page.goto("/");
  await expect(contact).toHaveAttribute("href", /wa\.me/);
  const moving = await contact.evaluate((button) => {
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
