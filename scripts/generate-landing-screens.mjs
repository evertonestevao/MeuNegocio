// Gera as telas da página inicial a partir da demonstração. Com o app rodando na porta 3000:
// node scripts/generate-landing-screens.mjs
import { mkdirSync, readFileSync } from "node:fs";
import { chromium } from "playwright";

const BASE = "http://localhost:3000";
// A pasta segue LANDING_SCREENS, em src/features/marketing/content.ts.
const version = readFileSync("src/features/marketing/content.ts", "utf8").match(/LANDING_SCREENS = "\/landing\/([\w-]+)"/)?.[1];
if (!version) throw new Error("LANDING_SCREENS não encontrado em src/features/marketing/content.ts");
const OUTPUT = `public/landing/${version}`;
const DESKTOP = { viewport: { width: 1360, height: 850 }, deviceScaleFactor: 2, locale: "pt-BR" };
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "pt-BR" };

/** Tira a faixa da demonstração: a imagem mostra o sistema como o cliente vê. */
async function capture(page, path, file, prepare) {
  await page.goto(`${BASE}${path}`);
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => {
    [...document.querySelectorAll("main p")].find((p) => p.textContent?.startsWith("Demonstração"))?.parentElement?.remove();
  });
  await prepare?.();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUTPUT}/${file}`, type: "jpeg", quality: 82 });
}

mkdirSync(OUTPUT, { recursive: true });
const browser = await chromium.launch();

const desktop = await (await browser.newContext(DESKTOP)).newPage();
await desktop.goto(`${BASE}/demo`);
await capture(desktop, "/dashboard", "inicio.jpg");
await capture(desktop, "/dashboard/schedule", "agenda.jpg");
await capture(desktop, "/dashboard/quotes", "orcamentos.jpg");
await capture(desktop, "/dashboard/finance", "financeiro.jpg");
await capture(desktop, "/dashboard/services", "servicos.jpg");

const phone = await (await browser.newContext(PHONE)).newPage();
await phone.goto(`${BASE}/demo`);
await capture(phone, "/dashboard", "inicio-celular.jpg");

// A ordem de serviço, como o técnico vê em campo.
await phone.goto(`${BASE}/demo?perfil=tecnico`);
await phone.goto(`${BASE}/dashboard/my-visits`);
await phone.waitForLoadState("networkidle");
const href = await phone.locator('main a[href*="/work-orders/"]').first().getAttribute("href");
await capture(phone, href, "ordem-servico.jpg");

await browser.close();
