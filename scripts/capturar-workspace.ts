import { chromium } from "playwright";

const BASE = "https://docto.com.ar";
const EMAIL = "medico.test@docto.com.ar";
const PASS = "DoctoTest2026!";
const SCREENSHOTS_DIR = "/Users/diegogonzales/uber-doc/video-onboarding/screenshots";
const CONSULTA_ID = "014325c7-0157-4259-b7c2-f8c1acfd8b21";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);

  // Login
  console.log("Logging in...");
  await page.goto(`${BASE}/auth/login`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASS);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard**", { timeout: 20000 });
  console.log("Login OK");

  // Navigate to workspace
  console.log(`Navigating to workspace ${CONSULTA_ID}...`);
  await page.goto(`${BASE}/medico/consulta/${CONSULTA_ID}/workspace`, {
    waitUntil: "networkidle",
    timeout: 30000,
  });
  await page.waitForTimeout(3000);

  const url = page.url();
  console.log(`Current URL: ${url}`);

  if (!url.includes("/workspace")) {
    console.error(`Redirected to ${url} -- workspace not accessible`);
    await browser.close();
    return;
  }

  // Screenshot 09: Video mode (default view)
  console.log("Capturing video mode...");
  await page.screenshot({
    path: `${SCREENSHOTS_DIR}/09-workspace-video.png`,
    fullPage: false,
  });
  console.log("09-workspace-video.png OK");

  // Screenshot 10: Documentation mode
  console.log("Switching to documentation mode...");
  const docBtn = page.locator('button:has-text("Documentar")');
  const docCount = await docBtn.count();
  console.log(`Documentar buttons: ${docCount}`);

  if (docCount > 0) {
    await docBtn.first().click();
    await page.waitForTimeout(1500);

    await page.screenshot({
      path: `${SCREENSHOTS_DIR}/10-workspace-documentacion.png`,
      fullPage: false,
    });
    console.log("10-workspace-documentacion.png OK");

    // Screenshot 11: Receta section opened
    console.log("Opening RECETA accordion...");
    const recetaBtn = page.locator('button:has-text("RECETA")');
    const recetaCount = await recetaBtn.count();
    console.log(`RECETA buttons: ${recetaCount}`);

    if (recetaCount > 0) {
      await recetaBtn.first().click();
      await page.waitForTimeout(800);

      // Scroll down to show receta content
      await page.evaluate(() => {
        const btns = document.querySelectorAll("button");
        for (const b of btns) {
          if (b.textContent?.includes("RECETA")) {
            b.scrollIntoView({ behavior: "instant", block: "start" });
            break;
          }
        }
      });
      await page.waitForTimeout(500);

      await page.screenshot({
        path: `${SCREENSHOTS_DIR}/11-workspace-receta.png`,
        fullPage: false,
      });
      console.log("11-workspace-receta.png OK");
    } else {
      console.log("SKIP 11: No RECETA accordion");
    }
  } else {
    console.log("SKIP 10-11: No Documentar button found");
    // Maybe on mobile it shows different UI -- let's debug
    const pageText = await page.evaluate(() => document.body.innerText?.slice(0, 500));
    console.log("Page text:", pageText);
  }

  await browser.close();
  console.log("Done");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
