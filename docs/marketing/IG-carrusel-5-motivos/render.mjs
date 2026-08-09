// Renderiza las 7 placas del carrusel "5 razones para atender en Docto" como PNG 1080x1350 (@2x).
// Salida: ~/Desktop/Docto-IG/  (listo para AirDrop al celular)
// Uso: node docs/marketing/IG-carrusel-5-motivos/render.mjs
import { chromium } from "@playwright/test";
import { fileURLToPath } from "node:url";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";

const dir = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(os.homedir(), "Desktop", "Docto-IG");
fs.mkdirSync(out, { recursive: true });

const slides = [
  ["s0", "01-portada.png"],
  ["s1", "02-tu-consultorio.png"],
  ["s2", "03-cobras-directo.png"],
  ["s3", "04-cero-estructura.png"],
  ["s4", "05-respaldo.png"],
  ["s5", "06-matricula-verificada.png"],
  ["s6", "07-cierre.png"],
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 2 });
await page.goto("file://" + path.join(dir, "slides.html"));
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(500);

for (const [id, file] of slides) {
  await page.locator("#" + id).screenshot({ path: path.join(out, file) });
  console.log("OK →", file);
}

await browser.close();
console.log("\nListo. Carpeta:", out);
