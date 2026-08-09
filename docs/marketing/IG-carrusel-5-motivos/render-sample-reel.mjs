import { chromium } from "@playwright/test";
import { fileURLToPath } from "node:url";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { execSync } from "node:child_process";

const FFMPEG = "/opt/homebrew/bin/ffmpeg";
const dir = path.dirname(fileURLToPath(import.meta.url));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "reel-"));
const outDir = path.join(os.homedir(), "Desktop", "Docto-IG");
fs.mkdirSync(outDir, { recursive: true });
const outMp4 = path.join(outDir, "MUESTRA-reel-v2-karaoke.mp4");

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1080, height: 1920 },
  recordVideo: { dir: tmp, size: { width: 1080, height: 1920 } },
});
const page = await context.newPage();
await page.goto("file://" + path.join(dir, "sample-reel.html"));
await page.waitForTimeout(31800);           // deja correr la línea de tiempo (hook + karaoke)
const video = page.video();
await context.close();                       // finaliza el webm
await browser.close();
const webm = await video.path();
console.log("webm crudo:", webm);

execSync(
  `${FFMPEG} -y -i "${webm}" -c:v libx264 -pix_fmt yuv420p -r 30 ` +
  `-vf "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920" -movflags +faststart "${outMp4}"`,
  { stdio: "inherit" }
);
console.log("OK →", outMp4);
