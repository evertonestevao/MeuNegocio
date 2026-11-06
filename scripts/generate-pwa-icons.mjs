// Gera os ícones do PWA a partir do desenho da marca. Rodar só quando a marca mudar:
// node scripts/generate-pwa-icons.mjs
import { writeFileSync } from "node:fs";
import { chromium } from "playwright";

const NAVY = "#17222f";
const AMBER = "#f0b429";
const LETTER = "M22 76V24h15l13 24 13-24h15v52H63V49L50 72 37 49v27z";

/** Quadrado âmbar com a letra, para uso normal e favicon. */
const standard = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="${AMBER}"/><path d="${LETTER}" fill="${NAVY}"/></svg>`;
/** Sem transparência: a Apple preenche cantos transparentes de preto. */
const apple = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="${AMBER}"/><path d="${LETTER}" fill="${NAVY}"/></svg>`;
/** Mascarável: fundo inteiro e desenho dentro da zona segura, que o Android recorta em círculo. */
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="${NAVY}"/><g transform="translate(25 25) scale(.5)"><rect width="100" height="100" rx="22" fill="${AMBER}"/><path d="${LETTER}" fill="${NAVY}"/></g></svg>`;

const outputs = [
  ["public/icons/icon-192.png", standard, 192],
  ["public/icons/icon-512.png", standard, 512],
  ["public/icons/icon-maskable-512.png", maskable, 512],
  // Convenção do Next: vira <link rel="apple-touch-icon"> em todas as páginas.
  ["src/app/apple-icon.png", apple, 180],
];

const browser = await chromium.launch();
for (const [path, svg, size] of outputs) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<!doctype html><style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
  await page.screenshot({ path, omitBackground: true });
  await page.close();
}
// favicon.ico (16, 32 e 48 px, PNG embutido): o que o navegador pede sozinho em /favicon.ico.
const faviconSizes = [16, 32, 48];
const favicons = [];
for (const size of faviconSizes) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<!doctype html><style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${standard}`);
  favicons.push(await page.screenshot({ omitBackground: true }));
  await page.close();
}
await browser.close();
const header = Buffer.alloc(6);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(favicons.length, 4);
let offset = 6 + 16 * favicons.length;
const entries = favicons.map((png, index) => {
  const entry = Buffer.alloc(16);
  entry[0] = faviconSizes[index];
  entry[1] = faviconSizes[index];
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(offset, 12);
  offset += png.length;
  return entry;
});
writeFileSync("src/app/favicon.ico", Buffer.concat([header, ...entries, ...favicons]));
writeFileSync("src/app/icon.svg", standard);
