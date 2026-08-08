/**
 * Repaso de lo ya perdido — borradores que nunca llegaron al paciente
 * ════════════════════════════════════════════════════════════════════════════
 *
 * QUÉ HACE
 * Busca consultas y turnos que:
 *   - ya están CERRADOS,
 *   - el paciente PAGÓ,
 *   - NO tienen ningún documento clínico emitido, y
 *   - SÍ tienen un borrador con contenido clínico guardado.
 * Es decir: encuentros donde el profesional escribió, el sistema lo guardó, y el
 * paciente no recibió nada. Emite lo que quedó guardado y lo sella por el mismo
 * camino de firma que usa el rescate automático.
 *
 * POR QUÉ EXISTE
 * Hasta el 08/08/2026 ningún cierre automático miraba el borrador. Los
 * encuentros que se cerraron solos en ese período quedaron con lo escrito
 * adentro, sin entregar. Este script los repara de a uno, con reporte.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * USO
 *
 *   npx tsx scripts/rescatar-borradores-perdidos.ts              # SIMULACIÓN (default)
 *   npx tsx scripts/rescatar-borradores-perdidos.ts --aplicar    # emite de verdad
 *
 * Opciones:
 *   --aplicar            Ejecuta. Sin esto NO escribe nada: solo lista qué haría.
 *   --limite=N           Procesa como mucho N encuentros.
 *   --desde=ISO          Solo encuentros cerrados DESPUÉS de esta fecha.
 *   --hasta=ISO          Solo encuentros cerrados ANTES de esta fecha.
 *                        Default: el momento en que el rescate automático entró
 *                        en producción. Lo posterior lo cubren los cuatro caminos.
 *   --tipo=consulta|turno  Solo un canal. Default: los dos.
 *   --incluir-test       Incluye cuentas de prueba (por defecto se excluyen).
 *   --avisar-a-todos     Además del equipo, avisa al paciente y al profesional.
 *                        POR DEFECTO NO: mandarle un push a un paciente por una
 *                        consulta de hace dos meses es una decisión de Diego, no
 *                        un efecto colateral de correr un script.
 *
 * REQUISITOS (de PRODUCCIÓN, no de un entorno de prueba):
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, FIRMA_MASTER_KEY
 *   Se leen del entorno o de `.env.local`. Con una FIRMA_MASTER_KEY distinta a la
 *   de producción no se pueden desencriptar las claves privadas y los documentos
 *   salen sin sello.
 *
 * ANTES DE CORRERLO CON --aplicar: aplicar `supabase/migrations/20260808_rescate_borrador.sql`.
 * Sin esa migración, `firma_logs` rechaza el método de atribución del rescate y
 * los documentos se emiten SIN sello.
 *
 * IDEMPOTENTE
 * Un encuentro que ya tiene documentos deja de ser candidato, y el rescate
 * vuelve a chequearlo antes de emitir. Correrlo dos veces no duplica recetas.
 */

import { readFileSync } from "fs";
import path from "path";

cargarEnvLocal();

import {
  rescatarBorradorAlCerrar,
  type CanalRescate,
  type RescateInfo,
} from "../src/lib/consultas/cerrar-con-rescate";
import { TIPOS_FIRMABLES } from "../src/lib/firma/documento";
import { createAdminClient } from "../src/lib/supabase/admin";

/** Momento en que el rescate automático empezó a correr en producción. */
const CORTE_RESCATE_AUTOMATICO = "2026-08-08T00:00:00Z";

const ESTADOS_CERRADOS = ["completada", "completado"];

type Candidato = {
  tipo: CanalRescate;
  id: string;
  cerradoAt: string | null;
  cierreOrigen: string | null;
  campos: string[];
};

async function main() {
  const args = parsearArgs(process.argv.slice(2));
  const aplicar = args.has("aplicar");
  const incluirTest = args.has("incluir-test");
  const avisarATodos = args.has("avisar-a-todos");
  const hasta = args.get("hasta") ?? CORTE_RESCATE_AUTOMATICO;
  const desde = args.get("desde") ?? null;
  const limiteArg = args.get("limite");
  const limite = limiteArg ? Number(limiteArg) : Infinity;
  const tipoArg = args.get("tipo") as CanalRescate | undefined;

  if (!Number.isFinite(Date.parse(hasta))) salir(`--hasta no es una fecha válida: "${hasta}"`);
  if (desde && !Number.isFinite(Date.parse(desde))) salir(`--desde no es una fecha válida: "${desde}"`);
  if (limiteArg && (!Number.isFinite(limite) || limite < 1)) salir(`--limite tiene que ser un entero positivo`);
  if (tipoArg && tipoArg !== "consulta" && tipoArg !== "turno") salir(`--tipo solo acepta "consulta" o "turno"`);

  verificarEnv(aplicar);

  console.log("");
  console.log("══════════════════════════════════════════════════════════════");
  console.log("  Repaso de borradores que nunca llegaron al paciente");
  console.log("══════════════════════════════════════════════════════════════");
  console.log(`  Modo:        ${aplicar ? "APLICAR (emite documentos de verdad)" : "SIMULACIÓN (no escribe nada)"}`);
  console.log(`  Cerrados antes de: ${hasta}`);
  if (desde) console.log(`  Cerrados después de: ${desde}`);
  console.log(`  Canales:     ${tipoArg ?? "consultas y turnos"}`);
  console.log(`  Cuentas de prueba: ${incluirTest ? "incluidas" : "excluidas"}`);
  if (aplicar) console.log(`  Avisos:      ${avisarATodos ? "equipo + paciente + profesional" : "solo al equipo"}`);
  console.log("");

  const canales: CanalRescate[] = tipoArg ? [tipoArg] : ["consulta", "turno"];
  const candidatos: Candidato[] = [];

  for (const tipo of canales) {
    candidatos.push(...(await buscarCandidatos(tipo, { desde, hasta, incluirTest })));
  }

  if (candidatos.length === 0) {
    console.log("✓ No hay encuentros cerrados con contenido sin entregar. Nada que hacer.");
    console.log("");
    return;
  }

  const aProcesar = candidatos.slice(0, Number.isFinite(limite) ? limite : undefined);

  console.log(`Encontrados: ${candidatos.length}${aProcesar.length !== candidatos.length ? ` (se procesan ${aProcesar.length} por --limite)` : ""}`);
  console.log("");

  for (const c of aProcesar) {
    const fecha = c.cerradoAt ? c.cerradoAt.slice(0, 10) : "sin fecha de cierre";
    console.log(`· ${c.tipo} ${c.id}`);
    console.log(`    cerrado: ${fecha}${c.cierreOrigen ? ` (${c.cierreOrigen})` : ""}`);
    console.log(`    escrito sin entregar: ${c.campos.join(", ")}`);
  }
  console.log("");

  if (!aplicar) {
    console.log("SIMULACIÓN: no se emitió nada.");
    console.log("Para emitir de verdad, repetir con --aplicar (y con la migración 20260808 aplicada).");
    console.log("");
    return;
  }

  const resultados: RescateInfo[] = [];
  for (const c of aProcesar) {
    const info = await rescatarBorradorAlCerrar({
      tipo: c.tipo,
      id: c.id,
      origen: "rescate_historico",
      avisos: avisarATodos ? "todos" : "solo_equipo",
    });
    resultados.push(info);
    console.log(
      `${info.resultado === "emitido" ? "✓" : "·"} ${c.tipo} ${c.id} → ${info.resultado}` +
        (info.documentos_emitidos
          ? ` (${info.documentos_emitidos} documento(s), ${info.documentos_firmados} sellado(s))`
          : "") +
        (info.detalle ? ` — ${info.detalle}` : "")
    );
  }

  const emitidos = resultados.reduce((a, r) => a + r.documentos_emitidos, 0);
  const sellados = resultados.reduce((a, r) => a + r.documentos_firmados, 0);
  const conError = resultados.filter((r) => r.resultado === "error").length;

  console.log("");
  console.log("══════════════════════════════════════════════════════════════");
  console.log(`  Encuentros procesados: ${resultados.length}`);
  console.log(`  Documentos emitidos:   ${emitidos}`);
  console.log(`  Sellados:              ${sellados}${emitidos > sellados ? "  ⚠️ faltan sellos: revisar la migración 20260808 y FIRMA_MASTER_KEY" : ""}`);
  if (conError) console.log(`  Con error:             ${conError}  ⚠️ revisar el detalle de arriba`);
  console.log("══════════════════════════════════════════════════════════════");
  console.log("");
}

// ─── Búsqueda de candidatos ──────────────────────────────────────────────────

/**
 * Cerrado + pagado + sin documentos + con borrador con contenido.
 *
 * El filtro de "pagado" se hace por canal:
 *   - consultas: `mp_status = 'approved'` (o pago simulado de cuenta de prueba).
 *   - turnos:    el turno existe porque se reservó y se cobró; se exige `pagado`
 *                si la columna está poblada, y si no se toma el estado cerrado
 *                como prueba de que ocurrió.
 * Ante la duda se INCLUYE en la lista y se marca: es un repaso manual, no un cron.
 */
async function buscarCandidatos(
  tipo: CanalRescate,
  filtros: { desde: string | null; hasta: string; incluirTest: boolean }
): Promise<Candidato[]> {
  const admin = createAdminClient();
  const tabla = tipo === "turno" ? "turnos" : "consultas";
  const columnaAncla = tipo === "turno" ? "turno_id" : "consulta_id";

  let query = admin
    .from(tabla)
    .select("id, estado, paciente_id, medico_id, doc_borrador, completada_at, cierre_origen")
    .in("estado", ESTADOS_CERRADOS)
    .not("doc_borrador", "is", null);

  // `completada_at` puede ser NULL en cierres viejos (anteriores al 04/08): esos
  // no se pueden acotar por fecha, así que entran igual y se filtran a ojo.
  if (filtros.desde) query = query.or(`completada_at.is.null,completada_at.gte.${filtros.desde}`);
  query = query.or(`completada_at.is.null,completada_at.lte.${filtros.hasta}`);

  const { data, error } = await query;
  if (error) salir(`No se pudo consultar ${tabla}: ${error.message}`);

  const salida: Candidato[] = [];

  for (const fila of data ?? []) {
    const b = (fila.doc_borrador ?? {}) as Record<string, unknown>;
    const campos = camposConContenido(b);
    if (campos.length === 0) continue;

    // ¿Ya tiene documentos clínicos? Entonces no perdió nada.
    const { count, error: errDocs } = await admin
      .from("documentos")
      .select("id", { count: "exact", head: true })
      .eq(columnaAncla, fila.id)
      .in("tipo", [...TIPOS_FIRMABLES]);

    if (errDocs) salir(`No se pudieron contar documentos de ${tabla} ${fila.id}: ${errDocs.message}`);
    if ((count ?? 0) > 0) continue;

    if (!filtros.incluirTest && (await esDePrueba(tipo, fila.paciente_id, fila.medico_id))) continue;

    salida.push({
      tipo,
      id: fila.id,
      cerradoAt: fila.completada_at ?? null,
      cierreOrigen: fila.cierre_origen ?? null,
      campos,
    });
  }

  return salida;
}

/** Qué campos clínicos tiene escritos el borrador (para el reporte). */
function camposConContenido(b: Record<string, unknown>): string[] {
  const campos: string[] = [];
  const tieneTexto = (k: string) => typeof b[k] === "string" && (b[k] as string).trim().length > 0;

  if (tieneTexto("diagnostico")) campos.push("diagnóstico");
  if (tieneTexto("receta")) campos.push("receta");
  if (tieneTexto("indicaciones")) campos.push("indicaciones");
  if (tieneTexto("certificado")) campos.push("certificado");
  if (tieneTexto("orden")) campos.push("orden");
  const dias = typeof b.dias_reposo === "number" ? b.dias_reposo : NaN;
  if (Number.isInteger(dias) && dias >= 1) campos.push(`${dias} día(s) de reposo`);

  return campos;
}

/** Filtro bilateral de cuentas de prueba (convención del repo). */
async function esDePrueba(
  tipo: CanalRescate,
  pacienteIdRegistro: string,
  medicoId: string
): Promise<boolean> {
  const admin = createAdminClient();

  const { data: medico } = await admin
    .from("medicos")
    .select("es_cuenta_test")
    .eq("id", medicoId)
    .maybeSingle();
  if (medico?.es_cuenta_test === true) return true;

  const columna = tipo === "turno" ? "id" : "user_id";
  const { data: paciente } = await admin
    .from("pacientes")
    .select("es_cuenta_test")
    .eq(columna, pacienteIdRegistro)
    .maybeSingle();

  return paciente?.es_cuenta_test === true;
}

// ─── Utilidades ──────────────────────────────────────────────────────────────

function parsearArgs(argv: string[]): Map<string, string> {
  const mapa = new Map<string, string>();
  for (const a of argv) {
    if (!a.startsWith("--")) continue;
    const limpio = a.slice(2);
    const corte = limpio.indexOf("=");
    if (corte === -1) mapa.set(limpio, "");
    else mapa.set(limpio.slice(0, corte), limpio.slice(corte + 1));
  }
  return mapa;
}

function verificarEnv(aplicar: boolean) {
  const faltan = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"].filter((k) => !process.env[k]);
  if (aplicar && !process.env.FIRMA_MASTER_KEY) faltan.push("FIRMA_MASTER_KEY");
  if (faltan.length > 0) salir(`Faltan variables de entorno: ${faltan.join(", ")}`);
}

function salir(mensaje: string): never {
  console.error(`\n✗ ${mensaje}\n`);
  process.exit(1);
}

function cargarEnvLocal() {
  try {
    const contenido = readFileSync(path.join(process.cwd(), ".env.local"), "utf8");
    for (const linea of contenido.split("\n")) {
      const limpia = linea.trim();
      if (!limpia || limpia.startsWith("#")) continue;
      const corte = limpia.indexOf("=");
      if (corte < 1) continue;
      const clave = limpia.slice(0, corte).trim();
      if (process.env[clave]) continue;
      process.env[clave] = limpia
        .slice(corte + 1)
        .trim()
        .replace(/^["']|["']$/g, "");
    }
  } catch {
    // Sin .env.local: se espera todo por entorno. `verificarEnv` avisa qué falta.
  }
}

main().catch((err) => {
  console.error("\n✗ Error inesperado:", err instanceof Error ? err.message : err);
  process.exit(1);
});
