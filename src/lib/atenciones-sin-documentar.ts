import { createAdminClient } from "@/lib/supabase/admin";
import { sendDoctoAlert } from "@/lib/alertas";
import { setsDeTest, esTest } from "@/lib/insights/filtro-test";
import { horaArgentina } from "@/lib/crons-meta";

/**
 * Vigía de atenciones cobradas que se cerraron SIN documentación.
 *
 * CASO QUE LO MOTIVA (consulta d9293d23, 01/08/2026): Hugo pagó $50.000, la
 * médica inició el video a las 23:15 y nunca tocó "Finalizar consulta" — se fue.
 * La consulta quedó abierta, el barrido nocturno la marcó completada de
 * madrugada y el paciente se quedó SIN receta. Nadie se enteró hasta que
 * escribió enojado CINCO DÍAS después.
 *
 * Huella del incidente: `evolucion` NULL + cero filas en `documentos`. El camino
 * de "Finalizar" del médico (WorkspaceConsulta) SIEMPRE inserta al menos un
 * documento y escribe `evolucion` (aunque sea string vacío) ANTES de pasar la
 * atención a completada; si no hay ni una cosa ni la otra, esa atención no pasó
 * por ahí: el médico cobró y el paciente se quedó sin nada.
 *
 * Esto SOLO OBSERVA Y AVISA: no toca estados, no bloquea ningún cierre, y cada
 * error se traga (best-effort) para no romper al cron que la invoca.
 *
 * Cubre los dos caminos de cierre sin tocar ninguno:
 *  - automático → se invoca al final de /api/cron/cerrar-huerfanas (aviso en el
 *    acto, apenas el barrido nocturno cierra lo que quedó abierto).
 *  - manual (médico, paciente, admin) y los automáticos de video/desconexión →
 *    los levanta el cron /api/cron/atenciones-sin-documentar cada 30 min.
 *    Deliberadamente NO se tocó el bloque fire-and-forget de WorkspaceConsulta.
 *
 * Anti-repetición SIN migración: cada atención alertada deja una fila en
 * `cron_runs` con clave `sin-doc:<tipo>:<id>` (el mismo registro durable que ya
 * usa `sendDoctoAlertThrottled`). El watchdog ignora las claves que no están en
 * su mapa ESPERADOS, así que no interfiere. Una atención = una sola alerta, para
 * siempre.
 */

/** Ventana hacia atrás del barrido. La primera corrida en producción es el
 *  "barrido inicial" pedido: levanta lo YA cerrado sin documentar de los últimos
 *  30 días y lo manda en UNA sola alerta, no una por atención. */
const DIAS_VENTANA = 30;

/** Gracia desde el cierre antes de mirar la atención. Evita el falso positivo de
 *  la carrera real: cuando el médico toca "Finalizar", LiveKit vacía la sala y el
 *  webhook puede marcar `completada` mientras el guardado de documentos (que es
 *  fire-and-forget en el navegador) todavía está en vuelo. */
const GRACIA_MIN = 30;

/** Excepción a la gracia: el barrido nocturno (`cierre_automatico`) SOLO cierra
 *  atenciones ya rancias (consultas con más de 4 h en curso, turnos con 10 min
 *  sin actividad), así que por construcción no hay ningún guardado en vuelo.
 *  Sin esta excepción, la llamada desde el propio cron cerrar-huerfanas — que
 *  acaba de cerrarlas — no vería nada y el aviso quedaría para 30 min después. */
const SIN_GRACIA = new Set(["cierre_automatico"]);

/** Tope de atenciones listadas por mail: si algo se rompe en masa, queremos un
 *  mail legible y no un volcado. Las que no entran se alertan en la corrida
 *  siguiente (solo se marcan como alertadas las que efectivamente se listaron). */
const TOPE_POR_ALERTA = 25;

const DIA_MS = 24 * 60 * 60 * 1000;

type Tipo = "consulta" | "turno";

// `cierre_origen` → cómo contárselo a un humano, diciendo SIEMPRE de entrada si
// el cierre fue manual o automático (los 6 caminos de cierre que firma el código
// desde el 04/08; espejo de CIERRE_LABEL en /admin/consultas/[id]).
const CIERRE: Record<string, string> = {
  medico:
    'MANUAL — el médico tocó "Finalizar consulta", pero no quedó guardado ni un documento (puede haber fallado el guardado)',
  paciente: "MANUAL — la cerró el paciente desde su pantalla final",
  admin_forzado: "MANUAL — la cerraste vos a mano desde el panel admin",
  webhook_video: "AUTOMÁTICO — se cerró sola al quedar vacía la sala de video",
  desconexion: "AUTOMÁTICO — se cortó la conexión y nadie volvió a entrar",
  cierre_automatico:
    'AUTOMÁTICO — la cerró el barrido nocturno: quedó abierta porque nadie tocó "Finalizar consulta"',
};

const CIERRE_DESCONOCIDO =
  "NO QUEDÓ REGISTRADO — la atención es anterior al 04/08, cuando se empezó a firmar el cierre";

const fmtARS = (n: unknown): string =>
  n == null || Number.isNaN(Number(n))
    ? "monto desconocido"
    : new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(Number(n));

/** fecha "AAAA-MM-DD" + hora "HH:MM[:SS]" en Argentina (UTC-3 fijo) → epoch ms. */
function epochAR(fecha: string | null, hora: string | null): number {
  if (!fecha) return NaN;
  const h = (hora ?? "00:00:00").length === 5 ? `${hora}:00` : (hora ?? "00:00:00");
  return new Date(`${fecha}T${h}-03:00`).getTime();
}

/** Fecha argentina de hace `dias` días, como "AAAA-MM-DD" (para comparar contra `turnos.fecha`). */
function fechaARhace(dias: number): string {
  const d = new Date(Date.now() - dias * DIA_MS - 3 * 3600_000);
  return d.toISOString().slice(0, 10);
}

const claveAlerta = (tipo: Tipo, id: string) => `sin-doc:${tipo}:${id}`;

type Candidata = {
  tipo: Tipo;
  id: string;
  medicoId: string | null;
  pacienteId: string | null;
  monto: number | null;
  cierreMs: number;
  cierreOrigen: string | null;
};

export type Persona = { nombre: string; contacto: string };

export type CandidataConNombres = Candidata & {
  medico: Persona | null;
  paciente: Persona | null;
};

/**
 * Arma el mail en criollo. Pura y exportada a propósito: es el texto que Diego
 * va a leer a las 3 de la mañana, y así se puede previsualizar sin tocar la base
 * ni mandar nada. Cada bloque responde las cinco preguntas del ticket — qué
 * paciente, qué médico, cuánto pagó, cuándo fue, si el cierre fue automático o
 * manual — y cierra con las dos únicas salidas: documentar o reembolsar.
 */
export function componerAlerta(
  items: CandidataConNombres[],
  restantes = 0
): { asunto: string; cuerpo: string } {
  const bloques = items.map((c) => {
    const cierre = c.cierreOrigen ? (CIERRE[c.cierreOrigen] ?? CIERRE_DESCONOCIDO) : CIERRE_DESCONOCIDO;
    const cuando = Number.isFinite(c.cierreMs) ? horaArgentina(new Date(c.cierreMs)) : "fecha desconocida";
    const link = `https://www.docto.com.ar/admin/consultas/${c.id}${c.tipo === "turno" ? "?tipo=turno" : ""}`;
    return [
      `● ${c.paciente?.nombre ?? "Paciente sin nombre"} pagó ${fmtARS(c.monto)} y no recibió NADA.`,
      `Cuándo fue: ${cuando} hs (${c.tipo === "turno" ? "turno programado" : "consulta inmediata"})`,
      `Cómo se cerró: ${cierre}`,
      `Qué falta: no quedó NI UN documento (ni receta, ni certificado, ni indicaciones, ni orden) y tampoco evolución.`,
      `Médico: ${c.medico?.nombre ?? "sin médico asignado"} — ${c.medico?.contacto ?? "sin contacto cargado"}`,
      `Paciente: ${c.paciente?.contacto ?? "sin contacto cargado"}`,
      `Ficha completa: ${link}`,
    ].join("\n");
  });

  const asunto =
    items.length === 1
      ? `🔴 Un paciente pagó y se quedó sin documentación (${items[0].paciente?.nombre ?? "paciente"})`
      : `🔴 ${items.length} atenciones cobradas y sin documentación`;

  const cuerpo = [
    items.length === 1
      ? "Una atención se cobró y se cerró sin que el médico dejara un solo documento ni evolución: el paciente pagó y no tiene su receta."
      : `${items.length} atenciones se cobraron y se cerraron sin un solo documento ni evolución: esos pacientes pagaron y no tienen su receta.`,
    "",
    bloques.join("\n\n———\n\n"),
    ...(restantes > 0
      ? ["", `(Hay ${restantes} más; llegan en la próxima corrida, para no mandarte un mail interminable.)`]
      : []),
    "",
    "———",
    "",
    "¿Tenés que hacer algo? Sí, y conviene HOY — el paciente ya pagó:",
    "1) Contactá al médico para que emita la documentación que falta (receta, certificado, indicaciones) y se la haga llegar al paciente.",
    "2) Si el médico no la emite o no responde, reembolsá al paciente desde la ficha de la atención (link de arriba).",
    "",
    "———",
    `Detalle técnico (para Claude): revisión de atenciones sin documentar (${horaArgentina()} hs). ${items.length} ${items.length === 1 ? "atención" : "atenciones"} en estado completada/completado con mp_status=approved, cero filas en \`documentos\` y \`evolucion\` vacía, fuera de cuentas test y sin reembolso en curso. IDs: ${items.map((c) => `${c.tipo}:${c.id}`).join(", ")}. Cada una queda marcada en \`cron_runs\` con clave sin-doc:<tipo>:<id> para no repetir el aviso.`,
  ].join("\n");

  return { asunto, cuerpo };
}

export type ResultadoRevision = {
  ok: boolean;
  revisadas: number;
  sin_documentar: number;
  alertadas: string[];
  ya_avisadas: number;
  error?: string;
};

/**
 * Busca atenciones cobradas y cerradas sin un solo documento ni evolución, y
 * manda UNA alerta con todas las que todavía no se avisaron.
 *
 * Nunca lanza: cualquier error vuelve en `{ ok:false, error }` para que el cron
 * que la llama siga su curso. Nunca escribe sobre `consultas`/`turnos`.
 */
export async function revisarAtencionesSinDocumentar(
  opts: { dias?: number } = {}
): Promise<ResultadoRevision> {
  const dias = opts.dias ?? DIAS_VENTANA;
  const vacio: ResultadoRevision = { ok: true, revisadas: 0, sin_documentar: 0, alertadas: [], ya_avisadas: 0 };

  try {
    const admin = createAdminClient();
    const ahora = Date.now();
    const desdeIso = new Date(ahora - dias * DIA_MS).toISOString();
    /** ¿Pasó el tiempo de gracia desde el cierre? */
    const cierreAsentado = (cierreMs: number, origen: string | null): boolean => {
      if (!Number.isFinite(cierreMs)) return false;
      const gracia = origen && SIN_GRACIA.has(origen) ? 0 : GRACIA_MIN * 60_000;
      return cierreMs <= ahora - gracia;
    };

    // Solo atenciones CERRADAS y COBRADAS de verdad.
    // - consultas: estado 'completada'. turnos: estado 'completado'.
    //   `ausente_paciente` / `ausente_medico` quedan fuera a propósito: ahí no
    //   hubo atención y la plata ya tiene su propia regla (turno 15feddea del
    //   21/07 es exactamente ese caso y NO debe alertar).
    // - mp_status 'approved': si no se cobró, no hay nada que reclamar.
    const [{ data: consultasRaw, error: errCI }, { data: turnosRaw, error: errT }] = await Promise.all([
      admin
        .from("consultas")
        .select("id, medico_id, paciente_id, monto, evolucion, completada_at, created_at, cierre_origen, reintegro_estado")
        .eq("estado", "completada")
        .eq("mp_status", "approved")
        .gte("created_at", desdeIso),
      admin
        .from("turnos")
        .select("id, medico_id, paciente_id, monto, evolucion, completada_at, fecha, hora_inicio, cierre_origen, reintegro_estado")
        .eq("estado", "completado")
        .eq("mp_status", "approved")
        .gte("fecha", fechaARhace(dias)),
    ]);
    if (errCI) return { ...vacio, ok: false, error: `consultas: ${errCI.message}` };
    if (errT) return { ...vacio, ok: false, error: `turnos: ${errT.message}` };

    const consultas = consultasRaw ?? [];
    const turnos = turnosRaw ?? [];
    const revisadas = consultas.length + turnos.length;
    if (revisadas === 0) return vacio;

    // Cuentas de prueba fuera (médico O paciente test), con el mismo criterio
    // que el tablero: fuente única en lib/insights/filtro-test.
    const sets = await setsDeTest(admin);

    // Sin evolución + cierre con más de GRACIA_MIN. El conteo de documentos se
    // resuelve después, en una sola query por tabla.
    const preCI = consultas.filter((c) => {
      if (esTest(sets, c.medico_id, c.paciente_id)) return false;
      if (c.reintegro_estado) return false; // la plata ya tiene destino: no es un caso abierto
      if (String(c.evolucion ?? "").trim()) return false;
      const cierreMs = c.completada_at ? Date.parse(c.completada_at) : Date.parse(c.created_at);
      return cierreAsentado(cierreMs, c.cierre_origen as string | null);
    });
    const preT = turnos.filter((t) => {
      if (esTest(sets, t.medico_id, t.paciente_id)) return false;
      if (t.reintegro_estado) return false;
      if (String(t.evolucion ?? "").trim()) return false;
      const cierreMs = t.completada_at ? Date.parse(t.completada_at) : epochAR(t.fecha, t.hora_inicio);
      return cierreAsentado(cierreMs, t.cierre_origen as string | null);
    });
    if (preCI.length === 0 && preT.length === 0) return { ...vacio, revisadas };

    const SENTINELA = "00000000-0000-0000-0000-000000000000";
    const idsCI = preCI.map((c) => c.id as string);
    const idsT = preT.map((t) => t.id as string);
    const [{ data: docsCI, error: errDocsCI }, { data: docsT, error: errDocsT }] = await Promise.all([
      admin.from("documentos").select("consulta_id").in("consulta_id", idsCI.length ? idsCI : [SENTINELA]),
      admin.from("documentos").select("turno_id").in("turno_id", idsT.length ? idsT : [SENTINELA]),
    ]);
    // Si esta query falla NO se puede seguir: sin datos, `documentos` parecería
    // vacío y alertaríamos atenciones bien documentadas — y encima quedarían
    // marcadas como avisadas, tapando para siempre el caso real. Mejor mudo.
    if (errDocsCI || errDocsT) {
      return { ...vacio, revisadas, ok: false, error: `documentos: ${(errDocsCI ?? errDocsT)?.message}` };
    }
    const conDocsCI = new Set((docsCI ?? []).map((d) => d.consulta_id as string));
    const conDocsT = new Set((docsT ?? []).map((d) => d.turno_id as string));

    const candidatas: Candidata[] = [
      ...preCI
        .filter((c) => !conDocsCI.has(c.id as string))
        .map((c) => ({
          tipo: "consulta" as const,
          id: c.id as string,
          medicoId: c.medico_id as string | null,
          pacienteId: c.paciente_id as string | null,
          monto: c.monto as number | null,
          cierreMs: c.completada_at ? Date.parse(c.completada_at) : Date.parse(c.created_at),
          cierreOrigen: (c.cierre_origen as string | null) ?? null,
        })),
      ...preT
        .filter((t) => !conDocsT.has(t.id as string))
        .map((t) => ({
          tipo: "turno" as const,
          id: t.id as string,
          medicoId: t.medico_id as string | null,
          pacienteId: t.paciente_id as string | null,
          monto: t.monto as number | null,
          cierreMs: t.completada_at ? Date.parse(t.completada_at) : epochAR(t.fecha, t.hora_inicio),
          cierreOrigen: (t.cierre_origen as string | null) ?? null,
        })),
    ];
    if (candidatas.length === 0) return { ...vacio, revisadas };

    // Un reembolso ya en marcha significa que el caso está atendido. Filtro
    // blando: si esta query fallara, `refunds` queda vacío y como mucho llega
    // una alerta de más — nunca una de menos.
    const { data: refunds } = await admin
      .from("refunds_pendientes")
      .select("recurso_id")
      .in("recurso_id", candidatas.map((c) => c.id));
    const conRefund = new Set((refunds ?? []).map((r) => r.recurso_id as string));

    // Anti-repetición durable: una atención ya alertada no vuelve a alertar nunca.
    const claves = candidatas.map((c) => claveAlerta(c.tipo, c.id));
    const { data: yaAlertadas, error: errClaves } = await admin
      .from("cron_runs")
      .select("cron_key")
      .in("cron_key", claves);
    // Si no se puede leer el registro de avisos, CALLARSE: preferimos perder una
    // alerta antes que mandarle a Diego el mismo caso todos los días.
    if (errClaves) return { ...vacio, revisadas, sin_documentar: candidatas.length, ok: false, error: `cron_runs: ${errClaves.message}` };
    const avisadas = new Set((yaAlertadas ?? []).map((r) => r.cron_key as string));

    const nuevas = candidatas
      .filter((c) => !conRefund.has(c.id) && !avisadas.has(claveAlerta(c.tipo, c.id)))
      .sort((a, b) => b.cierreMs - a.cierreMs);
    const yaAvisadas = candidatas.length - nuevas.length;
    if (nuevas.length === 0) return { ...vacio, revisadas, sin_documentar: candidatas.length, ya_avisadas: yaAvisadas };

    const aAlertar = nuevas.slice(0, TOPE_POR_ALERTA);

    // Datos humanos: nombres y contactos, con service role (columnas PII de
    // `medicos` no tienen grant para `authenticated` — ver CLAUDE.md).
    const medicoIds = [...new Set(aAlertar.map((c) => c.medicoId).filter(Boolean) as string[])];
    const pacienteIds = [...new Set(aAlertar.map((c) => c.pacienteId).filter(Boolean) as string[])];
    const [{ data: medicos }, { data: pacsPorUser }, { data: pacsPorId }] = await Promise.all([
      admin
        .from("medicos")
        // `email` es la cuenta con la que el médico entra y la que está poblada
        // en producción; `email_personal` casi siempre viene NULL. Van las dos.
        .select("id, nombre_completo, email, email_personal, celular_personal, telefono")
        .in("id", medicoIds.length ? medicoIds : [SENTINELA]),
      // consultas.paciente_id = pacientes.user_id; turnos.paciente_id = pacientes.id.
      admin
        .from("pacientes")
        .select("id, user_id, nombre_completo, email, telefono")
        .in("user_id", pacienteIds.length ? pacienteIds : [SENTINELA]),
      admin
        .from("pacientes")
        .select("id, user_id, nombre_completo, email, telefono")
        .in("id", pacienteIds.length ? pacienteIds : [SENTINELA]),
    ]);

    const medMap = new Map<string, Persona>(
      (medicos ?? []).map((m) => [
        m.id as string,
        {
          nombre: (m.nombre_completo as string) ?? "médico sin nombre",
          contacto:
            [m.email ?? m.email_personal, m.celular_personal ?? m.telefono].filter(Boolean).join(" · ") ||
            "sin contacto cargado",
        },
      ])
    );
    const pacMap = new Map<string, Persona>();
    for (const p of [...(pacsPorUser ?? []), ...(pacsPorId ?? [])]) {
      const persona: Persona = {
        nombre: (p.nombre_completo as string) ?? "paciente sin nombre",
        contacto: [p.email, p.telefono].filter(Boolean).join(" · ") || "sin contacto cargado",
      };
      if (p.user_id) pacMap.set(p.user_id as string, persona);
      if (p.id) pacMap.set(p.id as string, persona);
    }

    const { asunto, cuerpo } = componerAlerta(
      aAlertar.map((c) => ({
        ...c,
        medico: (c.medicoId ? medMap.get(c.medicoId) : undefined) ?? null,
        paciente: (c.pacienteId ? pacMap.get(c.pacienteId) : undefined) ?? null,
      })),
      nuevas.length - aAlertar.length
    );

    await sendDoctoAlert(asunto, cuerpo);

    // Marcar DESPUÉS de mandar: si el upsert falla, como mucho se repite el aviso
    // (molesto); si marcáramos antes y fallara el mail, el caso quedaría mudo
    // para siempre — exactamente el modo de falla que este vigía viene a matar.
    const nowIso = new Date().toISOString();
    const { error: errMarca } = await admin.from("cron_runs").upsert(
      aAlertar.map((c) => ({
        cron_key: claveAlerta(c.tipo, c.id),
        last_alerted_at: nowIso,
        last_status: "atencion_sin_documentar",
        updated_at: nowIso,
      }))
    );
    if (errMarca) {
      console.error("[sin-documentar] no pude marcar las atenciones alertadas:", errMarca.message);
    }

    return {
      ok: true,
      revisadas,
      sin_documentar: candidatas.length,
      alertadas: aAlertar.map((c) => `${c.tipo}:${c.id}`),
      ya_avisadas: yaAvisadas,
    };
  } catch (e) {
    // Best-effort absoluto: este vigía jamás debe tumbar al cron que lo llama.
    return { ...vacio, ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
