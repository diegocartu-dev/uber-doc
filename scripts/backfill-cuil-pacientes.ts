/**
 * Backfill y auditoría del CUIL de los pacientes.
 *
 * POR QUÉ EXISTE
 * El CUIL de una persona física se deriva de DNI + sexo. Aun así vivía como una
 * columna que solo se llenaba en dos momentos puntuales del alta, y el que
 * llegaba por cualquier otro camino quedaba sin CUIL para siempre. Encima el
 * algoritmo estaba implementado tres veces y las tres estaban mal, cada una
 * distinto — ver `src/lib/cuil.ts`.
 *
 * Este script hace dos cosas, las dos contra la fuente única ya corregida:
 *   1. BACKFILL — a quien tiene DNI + sexo y no tiene CUIL, se lo calcula.
 *   2. AUDITORÍA — recalcula el CUIL de todos los que ya lo tienen guardado y
 *      separa tres casos:
 *        · coincide                → nada que hacer
 *        · guardado INVÁLIDO       → no valida su propio dígito verificador.
 *                                    Es basura que dejó una de las copias
 *                                    rotas. Se corrige.
 *        · guardado válido pero ≠  → NO se toca y se reporta. Hay CUILes
 *                                    legítimos que no se derivan del sexo
 *                                    registral; el dato de la persona gana.
 *
 * Uso:
 *   npx tsx scripts/backfill-cuil-pacientes.ts          (simulacro, no escribe)
 *   npx tsx scripts/backfill-cuil-pacientes.ts --aplicar
 *
 * Requiere SUPABASE_ACCESS_TOKEN (se lee de .env.local).
 *
 * NO IMPRIME DATOS PERSONALES: ni nombres, ni DNI, ni CUIL, ni IDs. El repo es
 * público y la salida de este script termina pegada en un PR.
 */

import { readFileSync } from "node:fs";
import { calcularCuilFormateado } from "../src/lib/cuil";

// .env.local a mano: el script corre fuera de Next.
for (const linea of readFileSync(".env.local", "utf8").split("\n")) {
  const m = linea.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
}

const APLICAR = process.argv.includes("--aplicar");

// Se usa la Management API (SUPABASE_ACCESS_TOKEN) y no el cliente con service
// role: es el camino que ya usa el equipo para tocar la base de producción y no
// depende de que la clave de servicio local esté vigente.
const PROJECT_REF = "irpupskopjahbqqvckue";
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;

if (!TOKEN) {
  console.error("Falta SUPABASE_ACCESS_TOKEN en el entorno.");
  process.exit(1);
}

async function sql<T>(query: string): Promise<T> {
  const r = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const cuerpo = await r.json();
  if (!r.ok) throw new Error(typeof cuerpo?.message === "string" ? cuerpo.message : r.statusText);
  return cuerpo as T;
}

const PESOS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

/** ¿El CUIL guardado valida contra su propio dígito verificador? */
function esCuilValido(cuil: string): boolean {
  const d = cuil.replace(/\D/g, "");
  if (!/^\d{11}$/.test(d)) return false;
  if (!["20", "23", "24", "27"].includes(d.slice(0, 2))) return false;
  let suma = 0;
  for (let i = 0; i < 10; i++) suma += Number(d[i]) * PESOS[i];
  const r = suma % 11;
  return Number(d[10]) === (r === 0 ? 0 : 11 - r);
}

async function main() {
  const pacientes = await sql<{ id: string; dni: string | null; sexo_dni: string | null; cuil: string | null }[]>(
    "select id, dni, sexo_dni, cuil from pacientes;"
  );

  const aCompletar: { id: string; cuil: string }[] = [];
  const aCorregir: { id: string; cuil: string }[] = [];
  let yaCoincidian = 0;
  let distintosPeroValidos = 0;
  let noDerivables = 0;

  for (const p of pacientes) {
    const derivado = calcularCuilFormateado(p.dni, p.sexo_dni);
    const guardado = p.cuil?.trim() ?? "";

    if (!guardado) {
      if (derivado) aCompletar.push({ id: p.id, cuil: derivado });
      else noDerivables++;
      continue;
    }

    const mismos = guardado.replace(/\D/g, "") === derivado?.replace(/\D/g, "");
    if (mismos) {
      yaCoincidian++;
    } else if (!esCuilValido(guardado) && derivado) {
      aCorregir.push({ id: p.id, cuil: derivado });
    } else {
      distintosPeroValidos++;
    }
  }

  console.log(`\nPacientes en la base: ${pacientes.length}`);
  console.log(`  CUIL guardado que coincide con el derivado: ${yaCoincidian}`);
  console.log(`  Sin CUIL, DERIVABLE de DNI + sexo:          ${aCompletar.length}`);
  console.log(`  Sin CUIL y sin datos para derivarlo:        ${noDerivables}`);
  console.log(`  CUIL guardado INVÁLIDO (se corrige):        ${aCorregir.length}`);
  console.log(`  CUIL guardado válido pero distinto (se respeta): ${distintosPeroValidos}`);

  const total = aCompletar.length + aCorregir.length;
  if (total === 0) {
    console.log("\nNada para escribir.");
    return;
  }

  if (!APLICAR) {
    console.log(`\nSIMULACRO — ${total} filas se actualizarían. Correr con --aplicar para escribir.`);
    return;
  }

  // Un solo UPDATE con VALUES: es atómico y evita 60 round-trips.
  const filas = [...aCompletar, ...aCorregir]
    .map((f) => `('${f.id}'::uuid, '${f.cuil}')`)
    .join(",\n    ");

  const actualizadas = await sql<{ id: string }[]>(
    `update pacientes p set cuil = v.cuil
     from (values
    ${filas}
     ) as v(id, cuil)
     where p.id = v.id
     returning p.id;`
  );

  console.log(`\nActualizadas: ${actualizadas.length} de ${total}.`);
  if (actualizadas.length !== total) process.exit(1);
}

main();
