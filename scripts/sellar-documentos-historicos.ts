/**
 * Sellado de integridad diferido — documentos emitidos antes del sellado automático
 * ════════════════════════════════════════════════════════════════════════════════
 *
 * QUÉ HACE
 * Aplica el sello criptográfico (RSA-SHA256 + log encadenado en `firma_logs`) a los
 * documentos clínicos —receta, indicaciones, certificado, orden— que se emitieron
 * antes de que el sellado automático existiera y quedaron sin sello.
 *
 * QUÉ NO ES
 * No es una firma retroactiva ni una regularización. La firma electrónica (art. 5,
 * Ley 25.506) ocurrió AL EMITIRSE: el profesional, con identidad validada y
 * matrícula verificada contra REFEPS, emitió el documento desde su sesión
 * autenticada, en una consulta que ocurrió y que el paciente pagó. Lo que se aplica
 * acá es la EVIDENCIA criptográfica de esa firma.
 *
 * LÍMITE DURO
 * `firmado_at` es SIEMPRE el instante real del sellado (reloj del servidor, UTC).
 * La fecha de emisión viaja aparte (`contexto.emitido_at`), y la página pública de
 * verificación muestra las dos con la explicación. Ningún campo puede contener una
 * fecha de firma anterior a la real.
 *
 * ────────────────────────────────────────────────────────────────────────────────
 * USO
 *
 *   npx tsx scripts/sellar-documentos-historicos.ts             # simulación (default)
 *   npx tsx scripts/sellar-documentos-historicos.ts --aplicar   # sella de verdad
 *
 * Opciones:
 *   --aplicar            Ejecuta. Sin esto NO escribe nada: solo cuenta y muestra.
 *   --limite=N           Procesa como mucho N documentos en esta corrida.
 *   --tanda=N            Tamaño de lote (default 20). Se imprime avance por tanda.
 *   --hasta=ISO          Solo documentos emitidos ANTES de esta fecha.
 *                        Default: 2026-08-07T19:09:00Z (momento en que el sellado
 *                        automático empezó a funcionar en producción). Los que
 *                        quedan sin sello DESPUÉS de esa fecha son fallas del
 *                        camino nuevo: los vigila el cron, no este script.
 *   --lote=UUID          Reanuda una corrida anterior en ese lote.
 *
 * REQUISITOS (de PRODUCCIÓN, no de un entorno de prueba):
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, FIRMA_MASTER_KEY
 *   Se leen del entorno o de `.env.local`. Con una FIRMA_MASTER_KEY distinta a la
 *   de producción NO se pueden desencriptar las claves privadas y todo falla.
 *
 * ANTES DE CORRERLO: aplicar `supabase/migrations/20260807_sellado_diferido.sql`.
 * Sin esa migración `firma_logs` rechaza el método de atribución nuevo, el sellado
 * se revierte documento por documento y no queda nada firmado.
 *
 * REANUDABLE E IDEMPOTENTE
 * Un documento sellado deja de ser candidato (`firma_digital IS NOT NULL`) y el
 * guard de la base impide re-sellar. Si el proceso se corta, se vuelve a correr el
 * mismo comando y sigue donde quedó. Correrlo dos veces no duplica firmas ni logs.
 */

import { readFileSync } from "fs";
import path from "path";

// ─── Entorno ─────────────────────────────────────────────────────────────────
// Se carga apenas arranca el módulo, antes de que se llame a nada. Funciona
// aunque los `import` de abajo se evalúen primero (ESM los iza) porque los
// módulos de la app leen process.env DENTRO de sus funciones —`createAdminClient()`
// y `getMasterKey()`—, no al importarse.
cargarEnvLocal();

import {
  TIPOS_FIRMABLES,
  evaluarSelladoDiferido,
  sellarDocumentoDiferido,
  type MotivoNoApto,
} from "../src/lib/firma/documento";
import { createAdminClient } from "../src/lib/supabase/admin";

/** Momento en que el sellado automático empezó a funcionar en producción. */
const CORTE_SELLADO_AUTOMATICO = "2026-08-07T19:09:00Z";

const MOTIVO_LOTE = "remediacion_falla_de_sellado_automatico";
const DICTAMEN_REF = "docs/legal/2026-08-07-sellado-diferido-documentos-historicos.md";
const AUTORIZADO_POR = "Diego González (CEO) — decisión operativa 07/08/2026";

type MotivoSalteo = MotivoNoApto | "sin_claves" | "sin_identidad" | "error_sellado";

/** Qué significa cada motivo, en criollo, para el reporte final. */
const EXPLICACION: Record<MotivoSalteo, string> = {
  no_encontrado: "el documento ya no existe",
  ya_sellado: "ya tenía sello (idempotencia: es lo esperado al reanudar)",
  tipo_no_firmable: "no es un documento clínico (fila de tracking)",
  sin_evento_clinico: "no tiene consulta ni turno asociado",
  cuenta_test: "es de una cuenta de prueba",
  medico_no_validado_al_emitir:
    "el profesional no figura validado a la fecha de emisión → REVISIÓN MANUAL, no se sella",
  sin_claves: "no se pudo obtener ni generar la clave de firma del profesional",
  sin_identidad: "no se pudo congelar la identidad que el documento imprime",
  error_sellado: "el sellado falló (ver detalle)",
};

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const args = parsearArgs(process.argv.slice(2));
  const aplicar = args.has("aplicar");
  const hasta = args.get("hasta") ?? CORTE_SELLADO_AUTOMATICO;
  const tanda = Number(args.get("tanda") ?? 20);
  const limiteArg = args.get("limite");
  const limite = limiteArg ? Number(limiteArg) : Infinity;
  const loteArg = args.get("lote") ?? null;

  if (!Number.isFinite(Date.parse(hasta))) {
    salir(`--hasta no es una fecha válida: "${hasta}"`);
  }
  if (!Number.isFinite(tanda) || tanda < 1) {
    salir(`--tanda tiene que ser un entero positivo: "${args.get("tanda")}"`);
  }
  // `--limite` NO puede fallar abierto. Sin este guard, `--limite 10` (con
  // espacio en vez de `=`) o un `1O` con O mayúscula daban NaN, `Number.isFinite`
  // devolvía false y el `slice(0, undefined)` de más abajo procesaba TODO — la
  // opción cuyo único propósito es probar de a poco sobre documentos médicos
  // reales hacía exactamente lo contrario ante un typo.
  if (limiteArg && (!Number.isInteger(limite) || limite < 1)) {
    salir(
      `--limite tiene que ser un entero positivo: "${limiteArg}".\n` +
        `  Se escribe pegado con "=", por ejemplo: --limite=10`
    );
  }

  verificarEnv(aplicar);

  const supabase = createAdminClient();

  titulo(
    aplicar
      ? "SELLADO DE INTEGRIDAD DIFERIDO — MODO REAL (escribe en la base)"
      : "SELLADO DE INTEGRIDAD DIFERIDO — SIMULACIÓN (no escribe nada)"
  );
  console.log(`Documentos emitidos antes de : ${hasta}`);
  console.log(`Tipos alcanzados             : ${TIPOS_FIRMABLES.join(", ")}`);
  if (Number.isFinite(limite)) console.log(`Límite de esta corrida       : ${limite}`);
  console.log("");

  // ─── 1. Candidatos ─────────────────────────────────────────────────────────
  // Se leen TODOS de una antes de escribir nada: paginar mientras se sella
  // correría la ventana (un documento sellado deja de matchear el filtro) y
  // saltearía filas en silencio.
  const candidatos = await leerCandidatos(supabase, hasta);

  if (candidatos.length === 0) {
    console.log("No quedan documentos sin sello en esa ventana. Nada para hacer.");
    return;
  }

  console.log(`Documentos sin sello encontrados: ${candidatos.length}`);
  console.log(`  por tipo: ${resumirPorTipo(candidatos)}`);
  console.log("");

  const aProcesar = candidatos.slice(0, Number.isFinite(limite) ? limite : undefined);

  // ─── 2. Simulación ─────────────────────────────────────────────────────────
  if (!aplicar) {
    await simular(aProcesar, tanda);
    return;
  }

  // ─── 3. Sellado real ───────────────────────────────────────────────────────
  const loteId = await obtenerLote(supabase, loteArg, candidatos.length);
  console.log(`Lote: ${loteId}`);
  console.log("");

  const sellados: string[] = [];
  const clavesCreadas = new Set<string>();
  const medicosAlcanzados = new Set<string>();
  const salteados = new Map<MotivoSalteo, { id: string; detalle: string }[]>();

  for (let i = 0; i < aProcesar.length; i += tanda) {
    const grupo = aProcesar.slice(i, i + tanda);

    for (const doc of grupo) {
      // try/catch POR DOCUMENTO. El camino de sellado no solo devuelve
      // `{ok:false}`: también LANZA — `desencriptarClavePrivada()` tira
      // "Unsupported state or unable to authenticate data" si esa clave se
      // encriptó con otra FIRMA_MASTER_KEY, y `firmar()` tira con un PEM
      // corrupto. Sin esto, un solo profesional en ese estado abortaba la
      // corrida entera; y como los candidatos se leen siempre ordenados por
      // `created_at asc`, cada reintento moría en el mismo documento y la
      // operación no podía completarse nunca sin intervención manual.
      let r: Awaited<ReturnType<typeof sellarDocumentoDiferido>>;
      try {
        r = await sellarDocumentoDiferido(doc.id, {
          loteId,
          loteTotal: candidatos.length,
        });
      } catch (err) {
        anotar(
          salteados,
          "error_sellado",
          doc.id,
          err instanceof Error ? err.message : String(err)
        );
        continue;
      }

      if (r.ok) {
        sellados.push(doc.id);
        if (r.clave_creada) clavesCreadas.add(r.medico_id);

        // El aviso se registra APENAS se sella, no al final del for de tandas.
        // Si se escribía al cierre, una corrida cortada (Ctrl-C, timeout de la
        // terminal, una excepción) dejaba documentos sellados y CERO filas de
        // aviso: al relanzar, esos documentos ya no son candidatos —el filtro
        // pide `firma_digital IS NULL`— así que sus profesionales no volvían a
        // aparecer nunca y quedaban fuera del registro de notificación. El
        // aviso es la mitigación del riesgo principal del dictamen: no puede
        // depender de que la corrida llegue entera hasta el final.
        if (!medicosAlcanzados.has(r.medico_id)) {
          medicosAlcanzados.add(r.medico_id);
          await registrarAviso(supabase, loteId, r.medico_id);
        }
      } else {
        anotar(salteados, r.motivo, doc.id, r.detalle);
      }
    }

    console.log(
      `  … ${Math.min(i + tanda, aProcesar.length)}/${aProcesar.length} procesados ` +
        `(${sellados.length} sellados)`
    );

    // Progreso persistido por tanda: si esto se corta, el lote dice hasta dónde
    // llegó. Mismas claves que el cierre —`_ultima_corrida`— para que `detalle`
    // no termine con dos juegos de números que dicen cosas distintas.
    await guardarAvance(supabase, loteId, {
      sellados_ultima_corrida: sellados.length,
      salteados_ultima_corrida: contar(salteados),
      ultima_actualizacion: new Date().toISOString(),
      estado: "en_curso",
    });
  }

  // ─── 4. Cierre ─────────────────────────────────────────────────────────────
  // Los avisos ya se registraron uno por uno durante el sellado (ver arriba).
  // Acá solo se CUENTAN, y se cuentan desde la tabla: un lote se reanuda, así
  // que el total de profesionales alcanzados es el acumulado del lote, no el de
  // esta corrida. Reportar el de la corrida hacía que el operador que relanza
  // viera "2 profesionales" cuando el lote lleva 11, y no tuviera forma de
  // enterarse de la diferencia.
  const quedanPendientes = (await leerCandidatos(supabase, hasta)).length;
  const medicosDelLote = await contarAvisosDelLote(supabase, loteId);

  await guardarAvance(supabase, loteId, {
    sellados_ultima_corrida: sellados.length,
    salteados_ultima_corrida: contar(salteados),
    medicos_alcanzados: medicosDelLote ?? medicosAlcanzados.size,
    claves_creadas_para_el_sellado: clavesCreadas.size,
    pendientes_al_cerrar: quedanPendientes,
    ultima_actualizacion: new Date().toISOString(),
    estado: quedanPendientes === 0 ? "completado" : "en_curso",
  });

  reporte({
    sellados: sellados.length,
    salteados,
    clavesCreadas: clavesCreadas.size,
    medicosCorrida: medicosAlcanzados.size,
    medicosLote: medicosDelLote,
    pendientes: quedanPendientes,
    loteId,
  });
}

// ─── Simulación ──────────────────────────────────────────────────────────────

async function simular(docs: { id: string; tipo: string }[], tanda: number) {
  let aptos = 0;
  let sinClaves = 0;
  const salteados = new Map<MotivoSalteo, { id: string; detalle: string }[]>();

  for (let i = 0; i < docs.length; i += tanda) {
    for (const doc of docs.slice(i, i + tanda)) {
      // Mismo try/catch que el sellado real: la simulación no puede morirse
      // donde la corrida de verdad sigue, o dejaría de ser un ensayo fiel.
      let e: Awaited<ReturnType<typeof evaluarSelladoDiferido>>;
      try {
        e = await evaluarSelladoDiferido(doc.id);
      } catch (err) {
        anotar(
          salteados,
          "error_sellado",
          doc.id,
          err instanceof Error ? err.message : String(err)
        );
        continue;
      }

      if (e.apto) {
        aptos++;
        if (!e.tiene_claves) sinClaves++;
      } else {
        anotar(salteados, e.motivo, doc.id, e.detalle);
      }
    }
    console.log(`  … ${Math.min(i + tanda, docs.length)}/${docs.length} evaluados`);
  }

  titulo("RESULTADO DE LA SIMULACIÓN");
  console.log(`Se sellarían : ${aptos}`);
  console.log(`Se saltearían: ${contar(salteados)}`);
  if (sinClaves > 0) {
    console.log("");
    console.log(
      `Nota: ${sinClaves} de los que se sellarían son de profesionales sin clave de\n` +
        `firma activa. Se les genera el par en el momento y queda registrado en el log\n` +
        `como "clave_creada_para_sellado_diferido": no se oculta.`
    );
  }
  detallarSalteados(salteados);
  console.log("");
  console.log("No se escribió nada. Para ejecutar de verdad:");
  console.log("  npx tsx scripts/sellar-documentos-historicos.ts --aplicar");
}

// ─── Reporte final ───────────────────────────────────────────────────────────

function reporte(r: {
  sellados: number;
  salteados: Map<MotivoSalteo, { id: string; detalle: string }[]>;
  clavesCreadas: number;
  /** Profesionales que entraron en ESTA corrida. */
  medicosCorrida: number;
  /** Profesionales del lote entero (acumulado). `null` si no se pudo leer. */
  medicosLote: number | null;
  pendientes: number;
  loteId: string;
}) {
  titulo("RESULTADO");
  console.log(`Sellados en esta corrida       : ${r.sellados}`);
  console.log(`Salteados en esta corrida      : ${contar(r.salteados)}`);
  console.log(`Profesionales de esta corrida  : ${r.medicosCorrida}`);
  console.log(
    `Profesionales del lote         : ${
      r.medicosLote ?? "no se pudo leer — revisar `sellado_diferido_avisos`"
    }  ← a estos hay que avisarles`
  );
  console.log(`Claves generadas para el sello : ${r.clavesCreadas}`);
  console.log(`Sin sellar todavía             : ${r.pendientes}`);
  console.log(`Lote                           : ${r.loteId}`);

  detallarSalteados(r.salteados);

  console.log("");
  console.log("Qué queda por hacer (no lo hace este script):");
  console.log("  1. Avisar a los profesionales alcanzados (mail firma Valentina) y");
  console.log("     anotar envío y respuestas en `sellado_diferido_avisos`.");
  console.log("  2. Revisar a mano lo que quedó en 'medico_no_validado_al_emitir'.");
  console.log("  3. NO se avisa a los pacientes (decisión de producto).");
}

function detallarSalteados(salteados: Map<MotivoSalteo, { id: string; detalle: string }[]>) {
  if (salteados.size === 0) return;
  console.log("");
  console.log("Por qué se saltearon:");
  for (const [motivo, filas] of [...salteados.entries()].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  • ${filas.length} — ${motivo}: ${EXPLICACION[motivo] ?? ""}`);
    for (const f of filas.slice(0, 10)) {
      console.log(`      ${f.id}  ${f.detalle}`);
    }
    if (filas.length > 10) console.log(`      … y ${filas.length - 10} más`);
  }
}

// ─── Base ────────────────────────────────────────────────────────────────────

type SupabaseAdmin = ReturnType<typeof createAdminClient>;
type Candidato = { id: string; tipo: string; created_at: string };

async function leerCandidatos(supabase: SupabaseAdmin, hasta: string): Promise<Candidato[]> {
  const PAGINA = 500;
  const todos: Candidato[] = [];

  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await supabase
      .from("documentos")
      .select("id, tipo, created_at")
      .in("tipo", [...TIPOS_FIRMABLES])
      .is("firma_digital", null)
      .lt("created_at", hasta)
      .order("created_at", { ascending: true })
      .range(desde, desde + PAGINA - 1);

    if (error) salir(`No se pudieron leer los documentos: ${error.message}`);
    const filas = (data ?? []) as Candidato[];
    todos.push(...filas);
    if (filas.length < PAGINA) break;
  }

  return todos;
}

/**
 * Deja registrado que a este profesional hay que avisarle, en el mismo momento
 * en que se le sella el primer documento del lote. El mail lo manda una persona
 * (firma Valentina); acá queda a quién avisarle y dónde se anota su respuesta.
 * `firma_logs` es append-only y no admite guardar nada posterior a la firma: por
 * eso esta tabla existe.
 *
 * No aborta la corrida si falla: el sellado ya está hecho y es irreversible,
 * cortar acá no lo deshace. Se avisa fuerte y el reporte final vuelve a contar
 * desde la tabla, así la diferencia queda a la vista.
 */
async function registrarAviso(supabase: SupabaseAdmin, loteId: string, medicoId: string) {
  const { error } = await supabase
    .from("sellado_diferido_avisos")
    .upsert(
      [{ lote_id: loteId, medico_id: medicoId }],
      { onConflict: "lote_id,medico_id", ignoreDuplicates: true }
    );

  if (error) {
    console.log(`  ⚠️  No se pudo registrar el aviso de un profesional: ${error.message}`);
    console.log("      El documento quedó sellado. Falta la fila de aviso.");
  }
}

/** Profesionales alcanzados por el LOTE completo, no por esta corrida. */
async function contarAvisosDelLote(
  supabase: SupabaseAdmin,
  loteId: string
): Promise<number | null> {
  const { count, error } = await supabase
    .from("sellado_diferido_avisos")
    .select("medico_id", { count: "exact", head: true })
    .eq("lote_id", loteId);

  return error ? null : (count ?? 0);
}

async function obtenerLote(
  supabase: SupabaseAdmin,
  loteArg: string | null,
  total: number
): Promise<string> {
  if (loteArg) {
    const { data } = await supabase
      .from("sellado_diferido_lote")
      .select("id")
      .eq("id", loteArg)
      .maybeSingle();
    if (!data) salir(`No existe el lote ${loteArg}`);
    return loteArg;
  }

  // Reanudar el último lote en curso antes de abrir uno nuevo: una corrida que se
  // cortó y se relanza tiene que seguir siendo la MISMA operación en el registro.
  const { data: enCurso } = await supabase
    .from("sellado_diferido_lote")
    .select("id")
    .eq("detalle->>estado", "en_curso")
    .order("ejecutado_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (enCurso?.id) return enCurso.id as string;

  const { data: nuevo, error } = await supabase
    .from("sellado_diferido_lote")
    .insert({
      motivo: MOTIVO_LOTE,
      dictamen_ref: DICTAMEN_REF,
      autorizado_por: AUTORIZADO_POR,
      documentos_total: total,
      detalle: { estado: "en_curso", iniciado_at: new Date().toISOString() },
    })
    .select("id")
    .single();

  if (error || !nuevo) salir(`No se pudo registrar el lote: ${error?.message ?? "sin id"}`);
  return nuevo.id as string;
}

async function guardarAvance(
  supabase: SupabaseAdmin,
  loteId: string,
  detalle: Record<string, unknown>
) {
  const { data: actual } = await supabase
    .from("sellado_diferido_lote")
    .select("detalle")
    .eq("id", loteId)
    .maybeSingle();

  const previo = (actual?.detalle ?? {}) as Record<string, unknown>;
  await supabase
    .from("sellado_diferido_lote")
    .update({ detalle: { ...previo, ...detalle } })
    .eq("id", loteId);
}

// ─── Utilidades ──────────────────────────────────────────────────────────────

function parsearArgs(argv: string[]): Map<string, string> {
  const mapa = new Map<string, string>();
  for (const bruto of argv) {
    if (!bruto.startsWith("--")) continue;
    const [clave, ...resto] = bruto.slice(2).split("=");
    mapa.set(clave, resto.join("=") || "true");
  }
  return mapa;
}

function anotar(
  mapa: Map<MotivoSalteo, { id: string; detalle: string }[]>,
  motivo: MotivoSalteo,
  id: string,
  detalle: string
) {
  const lista = mapa.get(motivo) ?? [];
  lista.push({ id, detalle });
  mapa.set(motivo, lista);
}

function contar(mapa: Map<MotivoSalteo, { id: string; detalle: string }[]>): number {
  let n = 0;
  for (const filas of mapa.values()) n += filas.length;
  return n;
}

function resumirPorTipo(docs: Candidato[]): string {
  const porTipo = new Map<string, number>();
  for (const d of docs) porTipo.set(d.tipo, (porTipo.get(d.tipo) ?? 0) + 1);
  return [...porTipo.entries()].map(([t, n]) => `${n} ${t}`).join(", ");
}

function titulo(texto: string) {
  console.log("");
  console.log("═".repeat(Math.max(texto.length, 60)));
  console.log(texto);
  console.log("═".repeat(Math.max(texto.length, 60)));
}

function salir(mensaje: string): never {
  console.error(`\n✗ ${mensaje}\n`);
  process.exit(1);
}

function verificarEnv(aplicar: boolean) {
  const faltan = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    ...(aplicar ? ["FIRMA_MASTER_KEY"] : []),
  ].filter((k) => !process.env[k]);

  if (faltan.length > 0) {
    salir(
      `Faltan variables de entorno: ${faltan.join(", ")}.\n` +
        `  Tienen que ser las de PRODUCCIÓN (están en .env.local o en Vercel).`
    );
  }
}

/**
 * Carga `.env.local` sin pisar lo que ya venga del entorno. No se usa dotenv a
 * propósito: no es dependencia del proyecto y este script no justifica agregarla.
 */
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
