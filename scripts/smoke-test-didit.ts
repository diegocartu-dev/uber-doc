/**
 * Smoke-test de la integración Didit.
 * Crea una sesión REAL de verificación y muestra la URL.
 *
 * Uso:  npx tsx scripts/smoke-test-didit.ts
 *
 * Requiere DIDIT_API_KEY + DIDIT_WORKFLOW_ID en .env.vercel.local
 * (traídas con `npx vercel env pull .env.vercel.local --environment=production`).
 *
 * NO es parte del runtime. Es solo para validar empíricamente el API.
 */
import { readFileSync } from "fs";

// Cargar vars del archivo de env de Vercel a process.env ANTES de importar el cliente
function loadEnv(file: string) {
  const content = readFileSync(file, "utf8");
  for (const line of content.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) {
      const key = m[1];
      let val = m[2].trim().replace(/^["']|["']$/g, "");
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

async function main() {
  loadEnv(".env.vercel.local");

  // import dinámico para que el cliente lea process.env ya cargado
  const { crearSesionDidit, obtenerDecisionDidit } = await import(
    "../src/lib/didit/client"
  );

  console.log("→ Creando sesión de verificación en Didit...");
  const sesion = await crearSesionDidit({
    vendorData: "smoke-test-" + "docto",
    callbackUrl: "https://docto.com.ar/dashboard?identidad=verificada",
    language: "es",
  });

  console.log("\n✅ Sesión creada correctamente:");
  console.log("   session_id:", sesion.session_id);
  console.log("   status:    ", sesion.status);
  console.log("   workflow:  ", sesion.workflow_id);
  console.log("\n🔗 URL de verificación (abrila en el celular para probar):");
  console.log("   " + sesion.url);

  console.log("\n→ Leyendo decisión inicial (debería estar 'Not Started')...");
  try {
    const decision = await obtenerDecisionDidit(sesion.session_id);
    console.log("   status decisión:", decision.status);
    console.log("   features:", JSON.stringify(decision.features ?? []));
    console.log(
      "   id_verifications presentes:",
      (decision.id_verifications?.length ?? 0) > 0
    );
  } catch (e) {
    console.log(
      "   (decisión todavía no disponible:",
      e instanceof Error ? e.message : "error",
      ")"
    );
  }

  console.log("\n✅ Smoke-test OK — el API de Didit responde y la integración está bien cableada.");
}

main().catch((e) => {
  console.error("\n❌ Smoke-test FALLÓ:");
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
