import { chromium } from "playwright";

const BASE = "https://docto.com.ar";
const EMAIL = "medico.test@docto.com.ar";
const PASS = "DoctoTest2026!";
const SCREENSHOTS_DIR = "/Users/diegogonzales/uber-doc/video-onboarding/screenshots";

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
  page.setDefaultTimeout(15000);

  // ── Login ──
  console.log("[1] Logging in...");
  await page.goto(`${BASE}/auth/login`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASS);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard**", { timeout: 20000 });
  console.log("[1] Login OK");

  // Wait for dashboard to fully render
  await page.waitForTimeout(2000);

  // ── Screenshot 12: Dashboard con CI OFF ──
  console.log("[2] Capturando dashboard con CI OFF...");
  try {
    // Find the toggle switch
    // First toggle is CI availability (the one inside DisponibilidadMedico)
    const toggle = page.locator('button[role="switch"]').first();
    const exists = await toggle.count();
    console.log(`    Toggle found: ${exists}`);

    if (exists > 0) {
      const isChecked = await toggle.getAttribute("aria-checked");
      console.log(`    aria-checked: ${isChecked}`);

      if (isChecked === "true") {
        // CI is ON, need to turn it OFF
        // The toggle might be inside a collapsed section; use JS click
        console.log("    Clicking toggle to turn OFF via JS...");
        await page.evaluate(() => {
          const switches = document.querySelectorAll('button[role="switch"]');
          if (switches[0]) (switches[0] as HTMLElement).click();
        });
        await page.waitForTimeout(3000);
      }

      // Verify state
      const newState = await page.evaluate(() => {
        const sw = document.querySelector('button[role="switch"]');
        return sw?.getAttribute("aria-checked");
      });
      console.log(`    New state: ${newState}`);

      // Scroll to top
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(500);

      await page.screenshot({
        path: `${SCREENSHOTS_DIR}/12-dashboard-ci-off.png`,
        fullPage: false,
      });
      console.log("[2] 12-dashboard-ci-off.png OK");

      // Turn CI back ON
      if (newState === "false") {
        console.log("    Re-enabling CI...");
        await page.evaluate(() => {
          const switches = document.querySelectorAll('button[role="switch"]');
          if (switches[0]) (switches[0] as HTMLElement).click();
        });
        await page.waitForTimeout(3000);
        console.log("    CI re-enabled");
      }
    } else {
      console.log("[2] SKIP: No toggle found");
    }
  } catch (err) {
    console.error("[2] Error:", (err as Error).message);
  }

  // ── Screenshot 13: Consultas pendientes (empty state) ──
  console.log("[3] Capturando bloque consultas pendientes...");
  try {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);

    // Scroll down to see the consultas pendientes area (below the toggle)
    await page.evaluate(() => window.scrollTo(0, 300));
    await page.waitForTimeout(1000);

    await page.screenshot({
      path: `${SCREENSHOTS_DIR}/13-consulta-pendiente.png`,
      fullPage: false,
    });
    console.log("[3] 13-consulta-pendiente.png OK");
  } catch (err) {
    console.error("[3] Error:", (err as Error).message);
  }

  // ── Check for workspace-accessible consultas ──
  console.log("[4] Checking historial for accessible consultas...");
  let workspaceId: string | null = null;

  try {
    await page.goto(`${BASE}/medico/historial`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);

    // Look for consultas with estado pagada or en_curso
    // The AdminConsultas component shows estado badges - look for those
    const pageContent = await page.content();

    // Check if there are any "en_curso" or "pagada" consultas
    const hasEnCurso = pageContent.includes("en_curso") || pageContent.includes("EN CURSO");
    const hasPagada = pageContent.includes("pagada") || pageContent.includes("PAGADA");
    console.log(`    en_curso: ${hasEnCurso}, pagada: ${hasPagada}`);

    // Try to find a link to workspace
    const workspaceLinks = page.locator('a[href*="/workspace"]');
    const linkCount = await workspaceLinks.count();
    console.log(`    Workspace links: ${linkCount}`);

    if (linkCount > 0) {
      const href = await workspaceLinks.first().getAttribute("href");
      console.log(`    First workspace link: ${href}`);
      if (href) {
        const match = href.match(/\/medico\/consulta\/([^/]+)\/workspace/);
        if (match) workspaceId = match[1];
      }
    }

    // Also try extracting IDs from consulta rows
    if (!workspaceId) {
      // Look for any consulta IDs in links
      const consultaLinks = page.locator('a[href*="/medico/consulta/"]');
      const cLinkCount = await consultaLinks.count();
      console.log(`    Consulta links: ${cLinkCount}`);
    }
  } catch (err) {
    console.error("[4] Error:", (err as Error).message);
  }

  // ── Workspace screenshots ──
  if (workspaceId) {
    console.log(`[5] Navigating to workspace ${workspaceId}...`);
    try {
      await page.goto(`${BASE}/medico/consulta/${workspaceId}/workspace`, {
        waitUntil: "networkidle",
        timeout: 20000,
      });
      await page.waitForTimeout(3000);

      const currentUrl = page.url();
      console.log(`    Current URL: ${currentUrl}`);

      if (currentUrl.includes("/workspace")) {
        // We're in the workspace!
        // Screenshot 09: Video mode (default)
        await page.screenshot({
          path: `${SCREENSHOTS_DIR}/09-workspace-video.png`,
          fullPage: false,
        });
        console.log("[5] 09-workspace-video.png OK");

        // Screenshot 10: Documentation mode - click "Documentar" button
        const docBtn = page.locator('button:has-text("Documentar")');
        if ((await docBtn.count()) > 0) {
          await docBtn.click();
          await page.waitForTimeout(1000);

          await page.screenshot({
            path: `${SCREENSHOTS_DIR}/10-workspace-documentacion.png`,
            fullPage: false,
          });
          console.log("[5] 10-workspace-documentacion.png OK");

          // Screenshot 11: Scroll to receta section and open accordion
          const recetaAccordion = page.locator('button:has-text("RECETA")');
          if ((await recetaAccordion.count()) > 0) {
            await recetaAccordion.click();
            await page.waitForTimeout(500);

            // Scroll to make receta visible
            await recetaAccordion.scrollIntoViewIfNeeded();
            await page.waitForTimeout(500);

            await page.screenshot({
              path: `${SCREENSHOTS_DIR}/11-workspace-receta.png`,
              fullPage: false,
            });
            console.log("[5] 11-workspace-receta.png OK");
          } else {
            console.log("[5] SKIP 11: No RECETA accordion found");
          }
        } else {
          console.log("[5] SKIP 10-11: No Documentar button found");
        }
      } else {
        console.log(`[5] Redirected to ${currentUrl} — workspace not accessible`);
      }
    } catch (err) {
      console.error("[5] Error:", (err as Error).message);
    }
  } else {
    console.log("[5] No workspace-accessible consulta found. Trying direct approach...");

    // Plan B: Try to find any recent consulta ID from historial page content
    try {
      await page.goto(`${BASE}/medico/historial`, { waitUntil: "networkidle" });
      await page.waitForTimeout(2000);

      // Extract consulta IDs from the page
      const allLinks = await page.evaluate(() => {
        const anchors = document.querySelectorAll("a[href]");
        return Array.from(anchors).map((a) => a.getAttribute("href")).filter(Boolean);
      });
      console.log("    All links on historial:", allLinks.filter((l) => l?.includes("consulta")));

      // Look for any consulta ID pattern in page
      const ids = await page.evaluate(() => {
        const text = document.body.textContent || "";
        const uuids = text.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g);
        return uuids?.slice(0, 5) || [];
      });
      console.log("    UUIDs found:", ids);

      // Try the first UUID as a workspace
      for (const id of ids) {
        console.log(`    Trying workspace with ID: ${id}`);
        await page.goto(`${BASE}/medico/consulta/${id}/workspace`, {
          waitUntil: "networkidle",
          timeout: 15000,
        });
        await page.waitForTimeout(2000);

        const url = page.url();
        if (url.includes("/workspace")) {
          console.log("    Found accessible workspace!");
          workspaceId = id;

          // Screenshot 09: Video mode
          await page.screenshot({
            path: `${SCREENSHOTS_DIR}/09-workspace-video.png`,
            fullPage: false,
          });
          console.log("    09-workspace-video.png OK");

          // Screenshot 10: Documentation mode
          const docBtn = page.locator('button:has-text("Documentar")');
          if ((await docBtn.count()) > 0) {
            await docBtn.click();
            await page.waitForTimeout(1000);
            await page.screenshot({
              path: `${SCREENSHOTS_DIR}/10-workspace-documentacion.png`,
              fullPage: false,
            });
            console.log("    10-workspace-documentacion.png OK");

            // Screenshot 11: Receta
            const recetaAccordion = page.locator('button:has-text("RECETA")');
            if ((await recetaAccordion.count()) > 0) {
              await recetaAccordion.click();
              await page.waitForTimeout(500);
              await recetaAccordion.scrollIntoViewIfNeeded();
              await page.waitForTimeout(500);
              await page.screenshot({
                path: `${SCREENSHOTS_DIR}/11-workspace-receta.png`,
                fullPage: false,
              });
              console.log("    11-workspace-receta.png OK");
            }
          }
          break;
        } else {
          console.log(`    Redirected to ${url}, skipping`);
        }
      }

      if (!workspaceId) {
        console.log("[5] RESULT: No accessible workspace found (all consultas are completed/cancelled)");
        console.log("    To capture workspace screenshots, need a consulta with estado 'pagada' or 'en_curso'");
      }
    } catch (err) {
      console.error("[5] Error:", (err as Error).message);
    }
  }

  // ── Summary ──
  console.log("\n=== SUMMARY ===");
  const fs = await import("fs");
  const expected = [
    "09-workspace-video.png",
    "10-workspace-documentacion.png",
    "11-workspace-receta.png",
    "12-dashboard-ci-off.png",
    "13-consulta-pendiente.png",
  ];
  for (const name of expected) {
    const exists = fs.existsSync(`${SCREENSHOTS_DIR}/${name}`);
    console.log(`  ${exists ? "OK" : "MISSING"} ${name}`);
  }

  await browser.close();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
