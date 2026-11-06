import { expect, test } from "@playwright/test";

test("manifesto e ícones permitem instalar o aplicativo", async ({ page, request }) => {
  await page.goto("/login");
  const href = await page.locator('link[rel="manifest"]').getAttribute("href");
  const manifest = await (await request.get(href!)).json();
  expect(manifest.display).toBe("standalone");
  expect(manifest.start_url).toBe("/dashboard");
  expect(manifest.icons.some((icon: { purpose: string }) => icon.purpose === "maskable")).toBe(true);
  for (const icon of manifest.icons as { src: string }[]) {
    expect((await request.get(icon.src)).ok(), icon.src).toBe(true);
  }
  const sw = await request.get("/sw.js");
  expect(sw.headers()["cache-control"]).toContain("no-store");
});

test("service worker guarda só arquivos do sistema e mostra a tela sem conexão", async ({ page, context }) => {
  await page.goto("/demo");
  await page.waitForURL(/\/dashboard/);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect(page.getByText("Demonstração", { exact: false }).first()).toBeVisible();

  const cached = await page.evaluate(async () => {
    const urls: string[] = [];
    for (const name of await caches.keys()) {
      for (const entry of await (await caches.open(name)).keys()) urls.push(new URL(entry.url).pathname);
    }
    return urls;
  });
  expect(cached.length).toBeGreaterThan(0);
  const allowed = (path: string) => path === "/offline.html" || path.startsWith("/_next/static/") || path.startsWith("/icons/");
  expect(cached.filter((path) => !allowed(path))).toEqual([]);

  await context.setOffline(true);
  await page.goto("/dashboard/clients").catch(() => undefined);
  await expect(page.getByRole("heading", { name: "Sem conexão" })).toBeVisible();
  await context.setOffline(false);
});

test("a entrada fica fora do navegador comum e marca a abertura uma única vez", async ({ page }) => {
  await page.goto("/login");
  await expect(page.locator(".pwa-splash")).toBeHidden();
  await expect(page.locator("html")).not.toHaveClass(/pwa-splash-seen/);
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/pwa-splash-seen/);
});

test("a guia do navegador mostra o ícone da marca em todas as áreas", async ({ page, request }) => {
  for (const path of ["/", "/login", "/comecar"]) {
    await page.goto(path);
    const icons = await page.locator('link[rel="icon"]').evaluateAll((links) => links.map((link) => link.getAttribute("href") ?? ""));
    expect(icons.some((href) => href.startsWith("/favicon.ico")), path).toBe(true);
    expect(icons.some((href) => href.startsWith("/icon.svg")), path).toBe(true);
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
  }
  for (const href of ["/favicon.ico", "/icon.svg", "/apple-icon.png"]) {
    expect((await request.get(href)).ok(), href).toBe(true);
  }
});
