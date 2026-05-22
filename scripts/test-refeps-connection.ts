/**
 * Script de prueba de conexión REFEPS.
 * Ejecutar con: npx tsx scripts/test-refeps-connection.ts
 *
 * Requiere env vars:
 *   REFEPS_SYSTEM_ID, REFEPS_CREDENTIAL_ID, REFEPS_TOKEN_SECRET
 *
 * Paso 1: Probar obtención de token
 * Paso 2: Si token OK, probar búsqueda de Practitioner con DNI de prueba
 */

import { buildJWT, obtenerToken, buscarPorDNI } from "../src/lib/refeps/client";

async function main() {
  console.log("═══ Test conexión REFEPS ═══\n");

  // Verificar env vars
  const vars = ["REFEPS_SYSTEM_ID", "REFEPS_CREDENTIAL_ID", "REFEPS_TOKEN_SECRET"];
  for (const v of vars) {
    const val = process.env[v];
    if (!val) {
      console.error(`❌ Falta ${v}`);
      process.exit(1);
    }
    console.log(`✓ ${v} = ${val.slice(0, 4)}...${val.slice(-4)} (${val.length} chars)`);
  }

  // Paso 1: Token
  console.log("\n─── Paso 1: Obtener token ───");
  try {
    const token = await obtenerToken();
    console.log(`✓ Token obtenido: ${token.slice(0, 20)}... (${token.length} chars)`);
  } catch (err) {
    console.error("❌ Error obteniendo token:");
    console.error(err instanceof Error ? err.message : err);
    console.error("\nPosibles causas:");
    console.error("  - Token endpoint incorrecto (probar otra URL)");
    console.error("  - Secret word incorrecta o en formato equivocado");
    console.error("  - System ID o Credential ID incorrectos");
    console.error("  - Credencial expirada o revocada en ABM Dominios");
    process.exit(1);
  }

  // Paso 2: Buscar Practitioner
  console.log("\n─── Paso 2: Buscar Practitioner (DNI de prueba) ───");
  // Usar un DNI genérico — si no encuentra nadie, el test igual pasa
  // porque lo que importa es que la API responda correctamente
  const dniPrueba = "00000000";
  try {
    const result = await buscarPorDNI(dniPrueba);
    if (result) {
      console.log("✓ Practitioner encontrado:");
      console.log(`  Nombre: ${result.name?.[0]?.given?.join(" ")} ${result.name?.[0]?.family}`);
      console.log(`  Activo: ${result.active}`);
      console.log(`  Identifiers: ${result.identifier?.length ?? 0}`);
      console.log(`  Qualifications: ${result.qualification?.length ?? 0}`);
    } else {
      console.log("✓ API respondió correctamente (DNI de prueba no encontrado — esperado)");
    }
  } catch (err) {
    console.error("❌ Error buscando Practitioner:");
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }

  console.log("\n═══ Conexión REFEPS OK ═══");
}

main().catch(console.error);
