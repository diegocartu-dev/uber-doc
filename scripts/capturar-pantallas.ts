import { chromium } from 'playwright';
import path from 'path';

const BASE_URL = 'https://docto.com.ar';
const SCREENSHOT_DIR = path.resolve(__dirname, '../video-onboarding/screenshots');

const EMAIL = 'medico.test@docto.com.ar';
const PASSWORD = 'DoctoTest2026!';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });
  const page = await context.newPage();

  // ── Login ──
  console.log('[1/8] Navegando al login...');
  await page.goto(`${BASE_URL}/auth/login`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.fill('#email', EMAIL);
  await page.fill('#password', PASSWORD);
  await page.click('button[type="submit"]');

  // Esperar redirect al dashboard
  try {
    await page.waitForURL('**/dashboard**', { timeout: 20000 });
    console.log('Login exitoso, en dashboard.');
  } catch {
    console.error('ERROR: No se pudo completar el login. URL actual:', page.url());
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '00-login-error.png'), fullPage: true });
    await browser.close();
    return;
  }

  // Esperar que cargue el contenido del dashboard
  await page.waitForTimeout(3000);

  const screenshots: { name: string; path: string; success: boolean; error?: string }[] = [];

  async function capture(
    name: string,
    filename: string,
    action?: () => Promise<void>,
    options?: { fullPage?: boolean; waitMs?: number }
  ) {
    const filePath = path.join(SCREENSHOT_DIR, filename);
    try {
      if (action) await action();
      if (options?.waitMs) await page.waitForTimeout(options.waitMs);
      await page.screenshot({ path: filePath, fullPage: options?.fullPage ?? false });
      console.log(`OK: ${name} -> ${filename}`);
      screenshots.push({ name, path: filePath, success: true });
    } catch (err: any) {
      console.error(`FAIL: ${name} -> ${err.message}`);
      // Intentar capturar lo que haya en pantalla
      try {
        await page.screenshot({ path: filePath.replace('.png', '-fallback.png') });
      } catch {}
      screenshots.push({ name, path: filePath, success: false, error: err.message });
    }
  }

  // ── 1. Dashboard con CI activa (estado actual) ──
  await capture(
    'Dashboard (estado actual)',
    '01-dashboard-estado-actual.png',
    async () => {
      await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle', timeout: 20000 });
    },
    { fullPage: true, waitMs: 3000 }
  );

  // ── 2. Intentar toggle CI: buscar el toggle y clickearlo ──
  // Primero veamos si hay un toggle de CI. Si el toggle esta ON, lo apagamos para screenshot "inactiva"
  await capture(
    'Dashboard CI toggle (intentar desactivar)',
    '02-dashboard-ci-toggle.png',
    async () => {
      // Buscar el toggle/switch de CI
      const toggleSelector = '[role="switch"], input[type="checkbox"], button:has-text("Consulta Inmediata"), [data-testid*="toggle"], [data-testid*="ci"]';
      const toggle = page.locator(toggleSelector).first();
      if (await toggle.isVisible({ timeout: 3000 }).catch(() => false)) {
        await toggle.click();
        await page.waitForTimeout(2000);
      }
    },
    { fullPage: true, waitMs: 1000 }
  );

  // ── 3. Toggle CI de vuelta (activar) para screenshot "activa" ──
  await capture(
    'Dashboard CI activa (re-toggle)',
    '03-dashboard-ci-activa.png',
    async () => {
      const toggleSelector = '[role="switch"], input[type="checkbox"], button:has-text("Consulta Inmediata"), [data-testid*="toggle"]';
      const toggle = page.locator(toggleSelector).first();
      if (await toggle.isVisible({ timeout: 3000 }).catch(() => false)) {
        await toggle.click();
        await page.waitForTimeout(2000);
      }
    },
    { fullPage: true, waitMs: 1000 }
  );

  // ── 4. Agenda ──
  await capture(
    'Agenda del medico',
    '04-agenda.png',
    async () => {
      await page.goto(`${BASE_URL}/medico/agenda`, { waitUntil: 'networkidle', timeout: 20000 });
    },
    { fullPage: true, waitMs: 3000 }
  );

  // ── 5. Perfil ──
  await capture(
    'Perfil del medico',
    '05-perfil.png',
    async () => {
      await page.goto(`${BASE_URL}/medico/perfil`, { waitUntil: 'networkidle', timeout: 20000 });
    },
    { fullPage: true, waitMs: 3000 }
  );

  // ── 6. Nova ──
  await capture(
    'Nova (IA)',
    '06-nova.png',
    async () => {
      await page.goto(`${BASE_URL}/medico/nova`, { waitUntil: 'networkidle', timeout: 20000 });
    },
    { fullPage: true, waitMs: 3000 }
  );

  // ── 7. Historial ──
  await capture(
    'Historial',
    '07-historial.png',
    async () => {
      await page.goto(`${BASE_URL}/medico/historial`, { waitUntil: 'networkidle', timeout: 20000 });
    },
    { fullPage: true, waitMs: 3000 }
  );

  // ── 8. Workspace de consulta (intentar buscar una consulta existente) ──
  await capture(
    'Workspace consulta (intento)',
    '08-workspace.png',
    async () => {
      // Volver al dashboard para ver si hay link a alguna consulta
      await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle', timeout: 20000 });
      await page.waitForTimeout(2000);
      // Buscar cualquier link que lleve a /medico/consulta/
      const consultaLink = page.locator('a[href*="/medico/consulta/"]').first();
      if (await consultaLink.isVisible({ timeout: 3000 }).catch(() => false)) {
        await consultaLink.click();
        await page.waitForURL('**/medico/consulta/**', { timeout: 10000 });
        await page.waitForTimeout(3000);
      } else {
        console.log('No hay consulta activa visible en dashboard');
      }
    },
    { fullPage: true, waitMs: 2000 }
  );

  // ── Resumen ──
  console.log('\n=== RESUMEN ===');
  for (const s of screenshots) {
    console.log(`${s.success ? 'OK' : 'FAIL'}: ${s.name} ${s.success ? '' : '-> ' + s.error}`);
  }
  console.log(`\nTotal: ${screenshots.filter((s) => s.success).length}/${screenshots.length} exitosos`);
  console.log(`Screenshots en: ${SCREENSHOT_DIR}`);

  await browser.close();
}

main().catch((err) => {
  console.error('Error fatal:', err);
  process.exit(1);
});
