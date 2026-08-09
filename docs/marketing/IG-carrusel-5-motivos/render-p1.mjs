import { chromium } from "@playwright/test";
import { fileURLToPath } from "node:url";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";

const dir = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(os.homedir(), "Desktop", "Docto-IG");
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 2 });
await page.goto("file://" + path.join(dir, "placa1.html"));
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(500);
await page.locator("#s1").screenshot({ path: path.join(out, "MUESTRA-consultorio-v1.png") });
console.log("OK → MUESTRA-consultorio-v1.png");
await browser.close();
