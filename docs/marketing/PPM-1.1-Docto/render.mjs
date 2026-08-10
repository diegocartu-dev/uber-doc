// Renderiza las capturas ficticias y la pieza 1080×1920.
// Uso: node docs/marketing/PPM-1.1-Docto/render.mjs
// (requiere chromium de Playwright, ya instalado en el repo)
import { chromium } from "@playwright/test";
import { fileURLToPath } from "node:url";
import path from "node:path";

const dir = path.dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch();

async function shot({ file, out, viewport, scale, selector, fullViewport }) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: scale });
  await page.goto("file://" + path.join(dir, file));
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  if (fullViewport) {
    const h = await page.evaluate(() => document.body.scrollHeight);
    if (h > viewport.height) console.warn(`⚠ overflow: contenido ${h}px > lienzo ${viewport.height}px`);
    else console.log(`contenido ${h}px / lienzo ${viewport.height}px`);
    await page.screenshot({ path: path.join(dir, out) });
  } else {
    await page.locator(selector).screenshot({ path: path.join(dir, out) });
  }
  await page.close();
  console.log("OK →", out);
}

// Capturas (deviceScaleFactor 3 = nítidas al incrustarlas en la pieza)
await shot({
  file: "capturas/captura-nova-agenda.html",
  out: "capturas/captura-nova-agenda.png",
  viewport: { width: 450, height: 900 },
  scale: 3,
  selector: "#frame",
});
await shot({
  file: "capturas/captura-cobro-mp.html",
  out: "capturas/captura-cobro-mp.png",
  viewport: { width: 450, height: 900 },
  scale: 3,
  selector: "#frame",
});

// Pieza completa — PNG a 2x (2160×3840 px) para máxima nitidez en WhatsApp.
// Mandala como DOCUMENTO/archivo (no como "foto") para que no la recomprima.
await shot({
  file: "template-1080x1920.html",
  out: "PPM 1.1 Docto.png",
  viewport: { width: 1080, height: 1920 },
  scale: 2,
  fullViewport: true,
});

// Versión PDF — vectorial (no pixela nunca) y con el botón docto.com.ar/medicos
// como LINK clickeable de verdad. Ideal para mandar por WhatsApp como documento.
async function pdf(file, out) {
  const page = await browser.newPage();
  await page.goto("file://" + path.join(dir, file));
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  await page.pdf({
    path: path.join(dir, out),
    width: "1080px",
    height: "1920px",
    printBackground: true,
    pageRanges: "1",
  });
  await page.close();
  console.log("OK →", out);
}
await pdf("template-1080x1920.html", "PPM 1.1 Docto.pdf");

await browser.close();
