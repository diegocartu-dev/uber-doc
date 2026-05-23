/**
 * Script de prueba de conexión REFEPS.
 * Ejecutar con: npx tsx scripts/test-refeps-connection.ts [DNI]
 *
 * Requiere env vars:
 *   REFEPS_SYSTEM_ID, REFEPS_CREDENTIAL_ID, REFEPS_TOKEN_SECRET
 *
 * Paso 1: Probar obtención de token (v2)
 * Paso 2: Si token OK, probar búsqueda de Practitioner con DNI
 *
 * Si no se pasa DNI, solo testea el token.
 */

import { obtenerToken, buscarPorDNI } from "../src/lib/refeps/client";

async function main() {
  console.log("═══ Test conexión REFEPS ═══\n");

  // Verificar env vars
  const vars = [
    "REFEPS_SYSTEM_ID",
    "REFEPS_CREDENTIAL_ID",
    "REFEPS_TOKEN_SECRET",
  ];
  for (const v of vars) {
    const val = process.env[v];
    if (!val) {
      console.error(`❌ Falta ${v}`);
      process.exit(1);
    }
    console.log(
      `✓ ${v} = ${val.slice(0, 4)}...${val.slice(-4)} (${val.length} chars)`
    );
  }

  // Paso 1: Token (v2 endpoint)
  console.log("\n─── Paso 1: Obtener token (v2) ───");
  try {
    const token = await obtenerToken();
    console.log(
      `✓ Token obtenido: ${token.slice(0, 30)}... (${token.length} chars)`
    );
  } catch (err) {
    console.error("❌ Error obteniendo token:");
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }

  // Paso 2: Buscar Practitioner (solo si se pasa DNI)
  const dni = process.argv[2];
  if (!dni) {
    console.log(
      "\n⚠  No se pasó DNI como argumento. Solo se testeó el token."
    );
    console.log(
      "   Uso: npx tsx scripts/test-refeps-connection.ts <DNI_MEDICO>"
    );
    console.log("\n═══ Token REFEPS OK ═══");
    return;
  }

  console.log(`\n─── Paso 2: Buscar Practitioner (DNI: ${dni}) ───`);
  console.log(
    `   Sistema: https://sisa.msal.gov.ar/REFEPS|${dni}`
  );
  try {
    const result = await buscarPorDNI(dni);
    if (result) {
      console.log("✓ Practitioner ENCONTRADO:");
      console.log(
        `  Nombre: ${result.name?.[0]?.given?.join(" ")} ${result.name?.[0]?.family}`
      );
      console.log(`  Activo: ${result.active}`);
      console.log(`  Identifiers: ${result.identifier?.length ?? 0}`);
      if (result.identifier) {
        for (const id of result.identifier) {
          console.log(`    - ${id.system}: ${id.value}`);
        }
      }
      console.log(`  Qualifications: ${result.qualification?.length ?? 0}`);
      if (result.qualification) {
        for (const q of result.qualification) {
          const code = q.code?.coding?.[0];
          console.log(
            `    - ${code?.display ?? code?.code ?? "sin código"} (${q.identifier?.[0]?.value ?? "sin matrícula"})`
          );
        }
      }
    } else {
      console.log(
        `⚠  DNI ${dni} no encontrado en REFEPS (no tiene matrícula registrada)`
      );
    }
  } catch (err) {
    console.error("❌ Error buscando Practitioner:");
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }

  console.log("\n═══ Conexión REFEPS OK ═══");
}

main().catch(console.error);
