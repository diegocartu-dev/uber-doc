import { chromium } from "@playwright/test";
import { fileURLToPath } from "node:url";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";

const dir = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(os.homedir(), "Desktop", "Docto-IG", "4 - Carrusel médicos (5 razones)");
fs.mkdirSync(out, { recursive: true });

const slides = [
  ["portada", "1 - Portada.png"],
  ["r1", "2 - Razón 1 - Honorarios.png"],
  ["r2", "3 - Razón 2 - Consultorio.png"],
  ["r3", "4 - Razón 3 - Nova.png"],
  ["r4", "5 - Razón 4 - Receta.png"],
  ["r5", "6 - Razón 5 - REFEPS.png"],
  ["cierre", "7 - Cierre.png"],
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 2 });
await page.goto("file://" + path.join(dir, "carrusel-final.html"));
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(600);

for (const [id, file] of slides) {
  await page.locator("#" + id).screenshot({ path: path.join(out, file) });
  console.log("OK →", file);
}

await browser.close();
console.log("Listo: 7 placas en", out);
