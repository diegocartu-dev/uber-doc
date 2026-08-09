import { chromium } from "@playwright/test";
import { fileURLToPath } from "node:url";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { execSync } from "node:child_process";

const FFMPEG = "/opt/homebrew/bin/ffmpeg";
const dir = path.dirname(fileURLToPath(import.meta.url));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "reelfull-"));
const outDir = path.join(os.homedir(), "Desktop", "Docto-IG");
fs.mkdirSync(outDir, { recursive: true });
const outMp4 = path.join(outDir, "REEL-algo-no-funciona.mp4");

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1080, height: 1920 },
  recordVideo: { dir: tmp, size: { width: 1080, height: 1920 } },
});
const page = await context.newPage();
await page.goto("file://" + path.join(dir, "reel-full.html"));
await page.waitForFunction(() => window.__DONE === true, null, { timeout: 180000 });
await page.waitForTimeout(300);
const video = page.video();
await context.close();
await browser.close();
const webm = await video.path();

execSync(
  `${FFMPEG} -y -i "${webm}" -c:v libx264 -pix_fmt yuv420p -r 30 ` +
  `-vf "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920" -movflags +faststart "${outMp4}"`,
  { stdio: "inherit" }
);
console.log("OK →", outMp4);
