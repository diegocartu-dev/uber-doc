import { chromium } from "@playwright/test";
import { fileURLToPath } from "node:url";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";

const dir = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(os.homedir(), "Desktop", "Docto-IG");
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch();

// 1) Capturas de producto → PNG assets (en la carpeta del repo, las usa slides-v2.html)
async function capshot(file, png) {
  const p = await browser.newPage({ viewport: { width: 450, height: 1000 }, deviceScaleFactor: 3 });
  await p.goto("file://" + path.join(dir, file));
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(400);
  await p.locator("#frame").screenshot({ path: path.join(dir, png) });
  await p.close();
  console.log("OK →", png);
}
await capshot("captura-cobro-50k.html", "captura-cobro-50k.png");
await capshot("captura-nova-50k.html", "captura-nova-50k.png");

// 2) Placas v2
const page = await browser.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 2 });
await page.goto("file://" + path.join(dir, "slides-v2.html"));
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(600);
for (const [id, file] of [["s2", "MUESTRA-cobras-v2.png"], ["s3", "MUESTRA-nova-v2.png"]]) {
  await page.locator("#" + id).screenshot({ path: path.join(out, file) });
  console.log("OK →", file);
}
await browser.close();
