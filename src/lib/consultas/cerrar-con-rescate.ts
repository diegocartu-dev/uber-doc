// src/lib/consultas/cerrar-con-rescate.ts
//
// RESCATE DEL BORRADOR EN LOS CIERRES AUTOMÁTICOS
// ════════════════════════════════════════════════════════════════════════════
//
// EL PROBLEMA QUE RESUELVE (auditoría 08/08/2026)
// Docto autoguarda cada 5 s lo que el profesional escribe durante la consulta
// (`consultas.doc_borrador` / `turnos.doc_borrador`). Eso funcionaba bien. Lo
// que no existía era el paso siguiente: NINGUNA línea de código convertía ese
// borrador en documentos entregados al paciente. Era una libreta privada que
// solo servía para repoblar la pantalla del profesional.
//
// Consecuencia medida en producción: una consulta pagada de junio en la que el
// profesional escribió diagnóstico y evolución, el sistema los guardó… y el
// paciente no recibió nada. Nadie se enteró hasta dos meses después.
//
// CUATRO caminos cierran una consulta sin que el profesional toque "Finalizar":
//   1. desconexión de 2 min           → /api/consulta-estado, /api/turno-estado
//   2. sala de video vacía            → /api/livekit/webhook (room_finished)
//   3. cron nocturno de huérfanas     → /api/cron/cerrar-huerfanas
//   4. backstop diario de rejoin      → /api/cron/rejoin-expirar
// Ninguno miraba el borrador ni avisaba a nadie. Ahora los cuatro pasan por acá.
//
// LAS TRES REGLAS DE ESTE MÓDULO
//
//   1. NUNCA FRENAR EL CIERRE. El rescate corre DESPUÉS de que el estado ya
//      cambió, nunca antes, y esta función no lanza excepciones jamás: cualquier
//      fallo se loguea, se alerta y se devuelve como resultado. Un error del
//      rescate no puede dejar consultas abiertas para siempre.
//
//   2. UN SOLO GANADOR. El caller solo llama acá si SU update fue el que cerró
//      el encuentro (`.eq("estado","en_curso").select("id")` devolvió fila). Eso
//      convierte el cierre en un mutex natural: si el webhook y el polling se
//      disparan a la vez, uno solo cierra y uno solo rescata. Como cinturón
//      adicional, acá se vuelve a chequear que no existan ya documentos.
//
//   3. NO SE INVENTA NADA. Si el borrador no tiene contenido clínico, no se
//      emite ningún documento: se avisa igual, porque una consulta pagada que
//      terminó sin documentación es justamente lo que hay que detectar en horas
//      y no en cinco días.
//
// LO QUE SE EMITE es exactamente lo que emitiría el cierre normal del médico
// (mismos tipos, mismos campos, mismo fallback), y se sella por el mismo motor
// de firma — camino `firmarDocumentoPorRescate` en `@/lib/firma/documento`. La
// diferencia es la atribución, que dice la verdad: el profesional redactó, pero
// no confirmó al cerrar. Por eso el rescate SIEMPRE le avisa para que revise.
//
// EL BORRADOR NO SE BORRA. El cierre normal lo limpia (`doc_borrador: null`);
// el rescate lo conserva: es la evidencia de qué se rescató y de qué había.

import { createAdminClient } from "@/lib/supabase/admin";
import { sendDoctoAlert } from "@/lib/alertas";
import { logError, logInfo, logWarn } from "@/lib/logger";
import { firmarDocumentoPorRescate, TIPOS_FIRMABLES } from "@/lib/firma/documento";
import { pushAlMedico, pushAlPaciente } from "@/lib/push";

// ─── Tipos públicos ──────────────────────────────────────────────────────────

export type CanalRescate = "consulta" | "turno";

/** Por qué camino se cerró el encuentro sin que el profesional tocara "Finalizar". */
export type OrigenCierreAutomatico =
  | "desconexion"
  | "webhook_video"
  | "cierre_automatico"
  | "rejoin_expirado"
  /** Repaso posterior de encuentros ya cerrados (scripts/rescatar-borradores-perdidos.ts). */
  | "rescate_historico";

/**
 * A quién se avisa.
 *   - "todos"        → paciente + profesional + equipo (los cierres en vivo).
 *   - "solo_equipo"  → solo el equipo. Es lo que usa el repaso de lo ya perdido:
 *                      mandarle un push a un paciente por una consulta de hace dos
 *                      meses es una decisión de producto, no un efecto colateral
 *                      de correr un script.
 */
export type AlcanceAvisos = "todos" | "solo_equipo";

export type ResultadoRescate =
  /** Había contenido y se emitieron documentos. */
  | "emitido"
  /** El borrador estaba vacío o sin contenido clínico: no se inventó nada. */
  | "sin_contenido"
  /** Ya existían documentos de este encuentro: no se duplica (idempotencia). */
  | "ya_tenia_documentos"
  /** No se pudo leer el encuentro. */
  | "registro_no_encontrado"
  /** Algo falló. El cierre YA ocurrió igual. */
  | "error";

export type RescateInfo = {
  tipo: CanalRescate;
  id: string;
  origen: OrigenCierreAutomatico;
  resultado: ResultadoRescate;
  documentos_emitidos: number;
  documentos_firmados: number;
  evolucion_guardada: boolean;
  /** Había receta escrita pero el paciente no tiene CUIL: no se puede emitir. */
  receta_omitida_sin_cuil: boolean;
  detalle?: string;
  rescatado_at: string;
};

/** Texto humano de cada origen, para los avisos. */
const ORIGEN_EN_CRIOLLO: Record<OrigenCierreAutomatico, string> = {
  desconexion: "se cortó la conexión y pasaron 2 minutos sin que nadie volviera",
  webhook_video: "la sala de video quedó vacía y se cerró sola",
  cierre_automatico: "quedó abierta más de 4 horas y la cerró el repaso nocturno",
  rejoin_expirado: "quedó con un corte pendiente y la cerró el repaso de respaldo",
  rescate_historico: "se cerró en su momento sin entregar lo escrito, y lo detectamos después",
};

// ─── Borrador ────────────────────────────────────────────────────────────────

type BorradorClinico = {
  diagnostico?: unknown;
  receta?: unknown;
  indicaciones?: unknown;
  certificado?: unknown;
  dias_reposo?: unknown;
  orden?: unknown;
  evolucion?: unknown;
  evolucion_editada?: unknown;
  updated_at?: unknown;
};

function texto(valor: unknown): string {
  return typeof valor === "string" ? valor.trim() : "";
}

function diasReposoValidos(valor: unknown): number | null {
  const n = typeof valor === "number" ? valor : parseInt(String(valor ?? ""), 10);
  return Number.isInteger(n) && n >= 1 ? n : null;
}

/**
 * Contenido clínico REAL. Strings vacíos, espacios y `null` no cuentan.
 * La evolución NO entra: es la historia clínica del profesional, no un
 * documento del paciente. Se guarda aparte.
 */
function hayContenidoClinico(b: BorradorClinico): boolean {
  return (
    !!texto(b.diagnostico) ||
    !!texto(b.receta) ||
    !!texto(b.indicaciones) ||
    !!texto(b.certificado) ||
    !!texto(b.orden) ||
    diasReposoValidos(b.dias_reposo) !== null
  );
}

// ─── Entrada principal ───────────────────────────────────────────────────────

/**
 * Rescata el borrador de un encuentro que YA fue cerrado automáticamente.
 *
 * Llamar SIEMPRE después de que el UPDATE de cierre haya devuelto fila (o sea:
 * solo el que efectivamente cerró). Nunca lanza: devuelve el resultado.
 */
export async function rescatarBorradorAlCerrar(args: {
  tipo: CanalRescate;
  id: string;
  origen: OrigenCierreAutomatico;
  /** Default "todos". Ver `AlcanceAvisos`. */
  avisos?: AlcanceAvisos;
}): Promise<RescateInfo> {
  const base: RescateInfo = {
    tipo: args.tipo,
    id: args.id,
    origen: args.origen,
    resultado: "error",
    documentos_emitidos: 0,
    documentos_firmados: 0,
    evolucion_guardada: false,
    receta_omitida_sin_cuil: false,
    rescatado_at: new Date().toISOString(),
  };

  try {
    return await ejecutarRescate(args, base);
  } catch (err) {
    const detalle = err instanceof Error ? err.message : "error desconocido";
    logError("[RESCATE]", "Fallo inesperado del rescate de borrador", {
      tipo: args.tipo,
      id: args.id,
      origen: args.origen,
      error: detalle,
    });
    // Que el rescate falle NO puede pasar en silencio: si esto se rompe, volvemos
    // al mundo donde lo escrito se pierde y nadie se entera.
    await avisarAlEquipoQueFalloElRescate(args, detalle);
    return { ...base, resultado: "error", detalle };
  }
}

/**
 * Versión para los crons, que cierran varios de una. Secuencial a propósito: el
 * registro de firmas va encadenado por médico y dos firmas en paralelo del mismo
 * profesional se pelean por la punta de la cadena.
 */
export async function rescatarBorradoresAlCerrar(
  tipo: CanalRescate,
  ids: string[],
  origen: OrigenCierreAutomatico
): Promise<RescateInfo[]> {
  const salida: RescateInfo[] = [];
  for (const id of ids) {
    salida.push(await rescatarBorradorAlCerrar({ tipo, id, origen }));
  }
  return salida;
}

// ─── Implementación ──────────────────────────────────────────────────────────

async function ejecutarRescate(
  args: { tipo: CanalRescate; id: string; origen: OrigenCierreAutomatico; avisos?: AlcanceAvisos },
  base: RescateInfo
): Promise<RescateInfo> {
  const avisarATodos = (args.avisos ?? "todos") === "todos";
  const admin = createAdminClient();
  const tabla = args.tipo === "turno" ? "turnos" : "consultas";

  // Ojo: NO se selecciona `rescate_borrador` (columna de la migración 20260808).
  // Si el código sale antes que la migración, un SELECT que la incluya rompe la
  // query ENTERA en PostgREST y el rescate no correría nunca. Ver CLAUDE.md.
  const { data: registro, error: errRegistro } = await admin
    .from(tabla)
    .select("id, estado, paciente_id, medico_id, doc_borrador, evolucion, completada_at")
    .eq("id", args.id)
    .maybeSingle();

  if (errRegistro || !registro) {
    const detalle = errRegistro?.message ?? "no existe";
    logError("[RESCATE]", "No se pudo leer el encuentro a rescatar", {
      tabla,
      id: args.id,
      error: detalle,
    });
    return { ...base, resultado: "registro_no_encontrado", detalle };
  }

  const borrador = (registro.doc_borrador ?? {}) as BorradorClinico;
  const borradorActualizadoAt = texto(borrador.updated_at) || null;

  // ── Idempotencia (cinturón): ¿ya hay documentos clínicos de este encuentro? ──
  // El mutex real es el UPDATE de cierre del caller; esto cubre el caso de que
  // el profesional haya alcanzado a emitir por el camino normal.
  const columnaAncla = args.tipo === "turno" ? "turno_id" : "consulta_id";
  const { data: yaEmitidos, error: errDocs } = await admin
    .from("documentos")
    .select("id")
    .eq(columnaAncla, args.id)
    .in("tipo", [...TIPOS_FIRMABLES])
    .limit(1);

  if (errDocs) {
    // Ante la duda NO se emite: duplicar recetas es peor que no rescatar.
    logError("[RESCATE]", "No se pudo verificar si ya había documentos", {
      tabla,
      id: args.id,
      error: errDocs.message,
    });
    await avisarAlEquipoQueFalloElRescate(args, `no se pudo chequear documentos: ${errDocs.message}`);
    return { ...base, resultado: "error", detalle: errDocs.message };
  }

  const yaTeniaDocumentos = (yaEmitidos ?? []).length > 0;

  // La evolución se intenta guardar siempre que falte, haya o no documentos.
  const evolucionGuardada = await guardarEvolucionSiFalta(
    admin,
    tabla,
    args.id,
    registro.evolucion,
    borrador
  );

  const contexto = await datosDelEncuentro(admin, args.tipo, registro.medico_id, registro.paciente_id);

  if (yaTeniaDocumentos) {
    const info: RescateInfo = {
      ...base,
      resultado: "ya_tenia_documentos",
      evolucion_guardada: evolucionGuardada,
    };
    logInfo("[RESCATE]", "Cierre automático sobre un encuentro que ya tenía documentos", {
      tabla,
      id: args.id,
      origen: args.origen,
    });
    await registrarRescate(admin, tabla, args.id, info, borrador);
    return info;
  }

  // ── Sin contenido: no se inventa nada, pero se avisa igual ──────────────────
  if (!hayContenidoClinico(borrador)) {
    const info: RescateInfo = {
      ...base,
      resultado: "sin_contenido",
      evolucion_guardada: evolucionGuardada,
    };
    logWarn("[RESCATE]", "Encuentro cerrado solo y SIN nada escrito: paciente sin documentos", {
      tabla,
      id: args.id,
      origen: args.origen,
    });
    await registrarRescate(admin, tabla, args.id, info, borrador);
    if (avisarATodos) await avisarAlMedico(info, contexto);
    await avisarAlEquipo(info, contexto);
    return info;
  }

  // ── Emisión ────────────────────────────────────────────────────────────────
  if (!contexto.pacienteId) {
    const detalle = "no se pudo resolver el paciente del encuentro";
    logError("[RESCATE]", detalle, { tabla, id: args.id });
    await avisarAlEquipoQueFalloElRescate(args, detalle);
    return { ...base, resultado: "error", detalle, evolucion_guardada: evolucionGuardada };
  }

  const { filas, recetaOmitidaSinCuil } = armarDocumentos(borrador, contexto.pacienteTieneCuil);

  if (filas.length === 0) {
    // Solo pasa si lo único escrito era una receta y el paciente no tiene CUIL.
    const info: RescateInfo = {
      ...base,
      resultado: "sin_contenido",
      evolucion_guardada: evolucionGuardada,
      receta_omitida_sin_cuil: recetaOmitidaSinCuil,
      detalle: "había receta escrita pero el paciente no tiene CUIL cargado",
    };
    await registrarRescate(admin, tabla, args.id, info, borrador);
    if (avisarATodos) await avisarAlMedico(info, contexto);
    await avisarAlEquipo(info, contexto);
    return info;
  }

  const { data: insertados, error: errInsert } = await admin
    .from("documentos")
    .insert(
      filas.map((d) => ({
        consulta_id: args.tipo === "turno" ? null : args.id,
        turno_id: args.tipo === "turno" ? args.id : null,
        paciente_id: contexto.pacienteId,
        medico_id: registro.medico_id,
        tipo: d.tipo,
        diagnostico: texto(borrador.diagnostico),
        contenido: d.contenido,
        tratamiento: d.tratamiento ?? null,
        dias_reposo: d.dias_reposo ?? null,
      }))
    )
    .select("id, tipo");

  // El insert SÍ se chequea (en el cierre del médico no se chequeaba: si fallaba,
  // el borrador se borraba a renglón seguido y se perdía todo sin rastro).
  if (errInsert || !insertados || insertados.length === 0) {
    const detalle = errInsert?.message ?? "el insert no devolvió filas";
    logError("[RESCATE]", "No se pudieron emitir los documentos rescatados", {
      tabla,
      id: args.id,
      error: detalle,
    });
    const info: RescateInfo = { ...base, resultado: "error", detalle, evolucion_guardada: evolucionGuardada };
    await registrarRescate(admin, tabla, args.id, info, borrador);
    await avisarAlEquipo(info, contexto);
    return info;
  }

  // ── Firma: mismo motor y mismo log que cualquier otro documento ────────────
  // Si falla, el documento igual queda entregado (sale "sin sello", que es la
  // verdad). NUNCA se bloquea la entrega por la firma.
  let firmados = 0;
  for (const doc of insertados) {
    const r = await firmarDocumentoPorRescate(doc.id, registro.medico_id, {
      cierreOrigen: args.origen,
      borradorActualizadoAt,
      cerradoAt: registro.completada_at ?? base.rescatado_at,
    });
    if (r.ok) {
      firmados++;
    } else {
      logError("[RESCATE]", "Documento rescatado quedó sin sello", {
        documentoId: doc.id,
        error: r.error,
      });
    }
  }

  const info: RescateInfo = {
    ...base,
    resultado: "emitido",
    documentos_emitidos: insertados.length,
    documentos_firmados: firmados,
    evolucion_guardada: evolucionGuardada,
    receta_omitida_sin_cuil: recetaOmitidaSinCuil,
  };

  logInfo("[RESCATE]", "Borrador rescatado: documentos emitidos en un cierre automático", {
    tabla,
    id: args.id,
    origen: args.origen,
    emitidos: info.documentos_emitidos,
    firmados: info.documentos_firmados,
  });

  await registrarRescate(admin, tabla, args.id, info, borrador);
  if (avisarATodos) {
    await avisarAlPaciente(contexto, args.tipo, args.id);
    await avisarAlMedico(info, contexto);
  }
  await avisarAlEquipo(info, contexto);

  return info;
}

// ─── Armado de los documentos ────────────────────────────────────────────────

type FilaDocumento = {
  tipo: string;
  contenido: string;
  tratamiento?: string | null;
  dias_reposo?: number | null;
};

/**
 * Mismo criterio que el cierre normal del médico (`WorkspaceConsulta`), a
 * propósito: el paciente tiene que recibir lo mismo que habría recibido si el
 * profesional hubiese llegado a tocar "Finalizar".
 *
 * La receta se omite si el paciente no tiene CUIL, igual que en el cierre normal
 * (una receta sin CUIL no se puede emitir). Cuando pasa, el aviso lo dice.
 */
function armarDocumentos(
  b: BorradorClinico,
  pacienteTieneCuil: boolean
): { filas: FilaDocumento[]; recetaOmitidaSinCuil: boolean } {
  const diagnostico = texto(b.diagnostico);
  const receta = texto(b.receta);
  const indicaciones = texto(b.indicaciones);
  const certificado = texto(b.certificado);
  const orden = texto(b.orden);
  const dias = diasReposoValidos(b.dias_reposo);

  const filas: FilaDocumento[] = [];
  const recetaOmitidaSinCuil = !!receta && !pacienteTieneCuil;

  if (receta && pacienteTieneCuil) filas.push({ tipo: "receta", contenido: receta });
  if (indicaciones) filas.push({ tipo: "indicaciones", contenido: indicaciones });
  if (certificado || dias !== null) {
    filas.push({
      tipo: "certificado",
      contenido: certificado,
      tratamiento: certificado || indicaciones || null,
      dias_reposo: dias,
    });
  }
  if (orden) filas.push({ tipo: "orden", contenido: orden });

  // Fallback del cierre normal: si no hay ningún documento pero sí diagnóstico,
  // el paciente igual se lleva algo escrito.
  if (filas.length === 0 && diagnostico) {
    filas.push({ tipo: "indicaciones", contenido: diagnostico });
  }

  return { filas, recetaOmitidaSinCuil };
}

// ─── Evolución ───────────────────────────────────────────────────────────────

/**
 * Guarda la evolución del borrador si el encuentro todavía no tiene una.
 *
 * `evolucion_validada_at` queda en NULL a propósito: el profesional escribió la
 * evolución pero NUNCA la confirmó en pantalla. Marcarla como validada sería
 * afirmar un acto que no ocurrió.
 */
async function guardarEvolucionSiFalta(
  admin: ReturnType<typeof createAdminClient>,
  tabla: "consultas" | "turnos",
  id: string,
  evolucionActual: unknown,
  b: BorradorClinico
): Promise<boolean> {
  const delBorrador = texto(b.evolucion);
  if (!delBorrador) return false;
  if (texto(evolucionActual)) return false;

  const { error } = await admin
    .from(tabla)
    .update({
      evolucion: delBorrador,
      evolucion_editada: b.evolucion_editada === true,
    })
    .eq("id", id);

  if (error) {
    logError("[RESCATE]", "No se pudo guardar la evolución rescatada", {
      tabla,
      id,
      error: error.message,
    });
    return false;
  }
  return true;
}

// ─── Registro del rescate (para distinguirlo después) ────────────────────────

/**
 * Deja constancia en el encuentro de que pasó por el rescate.
 *
 * Best-effort en serio: si la columna `rescate_borrador` todavía no existe
 * (migración 20260808 sin aplicar), el UPDATE falla y se guarda la misma
 * constancia DENTRO del borrador, que ya es jsonb y no se borra. El rescate
 * nunca se cae por no poder anotar que ocurrió.
 */
async function registrarRescate(
  admin: ReturnType<typeof createAdminClient>,
  tabla: "consultas" | "turnos",
  id: string,
  info: RescateInfo,
  borrador: BorradorClinico
): Promise<void> {
  const { error } = await admin.from(tabla).update({ rescate_borrador: info }).eq("id", id);
  if (!error) return;

  logWarn("[RESCATE]", "No se pudo escribir rescate_borrador (¿falta la migración 20260808?)", {
    tabla,
    id,
    error: error.message,
  });

  const { error: errFallback } = await admin
    .from(tabla)
    .update({ doc_borrador: { ...borrador, rescate: info } })
    .eq("id", id);

  if (errFallback) {
    logError("[RESCATE]", "Tampoco se pudo anotar el rescate en el borrador", {
      tabla,
      id,
      error: errFallback.message,
    });
  }
}

// ─── Contexto humano (nombres para los avisos) ───────────────────────────────

type ContextoEncuentro = {
  pacienteId: string | null;
  pacienteNombre: string;
  pacienteTieneCuil: boolean;
  medicoId: string;
  medicoNombre: string;
  medicoPrimerNombre: string;
};

/**
 * `paciente_id` significa cosas distintas según el canal (asimetría de schema):
 *   - consulta: es `auth.users.id`  → hay que buscar `pacientes` por `user_id`
 *   - turno:    ya es `pacientes.id` → directo
 */
async function datosDelEncuentro(
  admin: ReturnType<typeof createAdminClient>,
  tipo: CanalRescate,
  medicoId: string,
  pacienteIdRegistro: string
): Promise<ContextoEncuentro> {
  const columna = tipo === "turno" ? "id" : "user_id";
  const { data: paciente } = await admin
    .from("pacientes")
    .select("id, nombre_completo, cuil")
    .eq(columna, pacienteIdRegistro)
    .maybeSingle();

  const { data: medico } = await admin
    .from("medicos")
    .select("id, nombre_completo")
    .eq("id", medicoId)
    .maybeSingle();

  const medicoNombre = medico?.nombre_completo ?? "profesional sin nombre en ficha";

  return {
    pacienteId: paciente?.id ?? null,
    pacienteNombre: paciente?.nombre_completo ?? "el paciente",
    pacienteTieneCuil: !!texto(paciente?.cuil),
    medicoId,
    medicoNombre,
    medicoPrimerNombre: medicoNombre.split(" ")[0] ?? "",
  };
}

// ─── Avisos ──────────────────────────────────────────────────────────────────

/** El paciente se entera de que sus documentos ya están. Best-effort. */
async function avisarAlPaciente(
  contexto: ContextoEncuentro,
  tipo: CanalRescate,
  id: string
): Promise<void> {
  if (!contexto.pacienteId) return;
  try {
    await pushAlPaciente(contexto.pacienteId, {
      title: "✅ Docto",
      body: "Tus documentos de la consulta ya están disponibles.",
      url: "/mis-consultas",
      tag: `docs-${tipo}-${id}`,
    });
  } catch {
    // Un push que no sale nunca puede romper el rescate.
  }
}

/**
 * El profesional se entera de que su consulta se cerró sola y de qué pasó con lo
 * que había escrito. Mensaje interno (queda en su bandeja aunque no tenga push)
 * + push best-effort. Sin jerga: el médico puede tener 70 años.
 */
async function avisarAlMedico(info: RescateInfo, contexto: ContextoEncuentro): Promise<void> {
  const admin = createAdminClient();
  const porque = ORIGEN_EN_CRIOLLO[info.origen];
  const fichaPaciente = contexto.pacienteId ? `/medico/paciente/${contexto.pacienteId}` : "/medico/historial";
  const hola = contexto.medicoPrimerNombre ? `Hola ${contexto.medicoPrimerNombre}. ` : "";

  let titulo: string;
  let cuerpo: string;

  if (info.resultado === "emitido") {
    titulo = "Cerramos tu consulta y le enviamos lo que habías escrito";
    cuerpo =
      `${hola}Tu consulta con ${contexto.pacienteNombre} terminó sin que pudieras tocar "Finalizar": ${porque}.\n\n` +
      `Para que el paciente no se quedara sin nada, le enviamos ${info.documentos_emitidos === 1 ? "el documento" : `los ${info.documentos_emitidos} documentos`} que ya habías escrito, tal cual quedaron guardados.\n\n` +
      `Te pedimos que los revises en la ficha del paciente. Si falta algo o querés corregirlo, escribinos y lo resolvemos.` +
      (info.receta_omitida_sin_cuil
        ? `\n\nUna aclaración importante: la receta NO se envió porque el paciente todavía no tiene el CUIL cargado, y sin CUIL no se puede emitir. Avisanos para resolverlo.`
        : "");
  } else {
    titulo = "Tu consulta se cerró sola y quedó sin documentación";
    cuerpo =
      `${hola}Tu consulta con ${contexto.pacienteNombre} terminó sin que pudieras tocar "Finalizar": ${porque}.\n\n` +
      `No encontramos nada escrito, así que el paciente quedó sin ningún documento.\n\n` +
      `Si llegaste a atenderlo, avisanos y lo resolvemos juntos.`;
  }

  const { error } = await admin.from("mensajes_internos_medicos").insert({
    medico_id: contexto.medicoId,
    titulo,
    cuerpo,
    severidad: "alta",
  });

  if (error) {
    logError("[RESCATE]", "No se pudo dejar el mensaje interno al profesional", {
      medicoId: contexto.medicoId,
      error: error.message,
    });
  }

  try {
    await pushAlMedico(contexto.medicoId, {
      title: "Docto — revisá una consulta",
      body:
        info.resultado === "emitido"
          ? "Tu consulta se cerró sola. Enviamos al paciente lo que habías escrito: revisalo."
          : "Tu consulta se cerró sola y quedó sin documentos para el paciente.",
      url: fichaPaciente,
      tag: `rescate-${info.tipo}-${info.id}`,
    });
  } catch {
    // Best-effort.
  }
}

/** Aviso al equipo: qué pasó, con quién, y qué hacer. En criollo. */
async function avisarAlEquipo(info: RescateInfo, contexto: ContextoEncuentro): Promise<void> {
  const porque = ORIGEN_EN_CRIOLLO[info.origen];
  const canal = info.tipo === "turno" ? "Un turno" : "Una consulta inmediata";
  const quien = `Profesional: ${contexto.medicoNombre}\nPaciente: ${contexto.pacienteNombre}\n${info.tipo === "turno" ? "Turno" : "Consulta"}: ${info.id}`;

  if (info.resultado === "emitido") {
    const sinSello = info.documentos_emitidos - info.documentos_firmados;
    const asunto = `📄 Rescatamos ${info.documentos_emitidos} documento${info.documentos_emitidos === 1 ? "" : "s"} de una consulta que se cerró sola`;
    const cuerpo =
      `${canal} se cerró sin que el profesional tocara "Finalizar": ${porque}.\n\n` +
      `Como había cosas escritas en el borrador, el sistema las emitió y se las mandó al paciente. Sin esto, el paciente se quedaba sin nada.\n\n` +
      `${quien}\n\n` +
      `Documentos enviados: ${info.documentos_emitidos}\n` +
      `Sellados electrónicamente: ${info.documentos_firmados}${sinSello > 0 ? ` (⚠️ ${sinSello} quedó/quedaron SIN sello — revisar si falta aplicar la migración 20260808_rescate_borrador.sql)` : ""}\n` +
      `Evolución guardada: ${info.evolucion_guardada ? "sí" : "no hacía falta o no había"}\n` +
      (info.receta_omitida_sin_cuil
        ? `\n⚠️ HABÍA UNA RECETA Y NO SE PUDO EMITIR: el paciente no tiene CUIL cargado. Sin CUIL no se puede emitir receta. Hay que pedirle el dato y reemitirla.\n`
        : "") +
      `\nQUÉ HACER: al profesional ya le avisamos para que revise lo enviado. Conviene confirmar con él que lo que salió es lo que quería mandar, sobre todo si es una receta o un certificado.`;
    await sendDoctoAlert(asunto, cuerpo);
    return;
  }

  if (info.resultado === "sin_contenido") {
    const asunto = "⚠️ Una consulta se cerró sola y el paciente quedó sin documentos";
    const cuerpo =
      `${canal} se cerró sin que el profesional tocara "Finalizar": ${porque}.\n\n` +
      `En el borrador no había contenido clínico, así que no se emitió nada: el paciente quedó SIN documentos.\n\n` +
      `${quien}\n` +
      (info.detalle ? `\nDetalle: ${info.detalle}\n` : "") +
      `\nQUÉ HACER: mirar si la consulta llegó a ocurrir. Si el paciente pagó y no lo atendieron, corresponde reembolso. Si lo atendieron y el profesional no llegó a escribir, hay que pedirle que documente. Al profesional ya le avisamos.`;
    await sendDoctoAlert(asunto, cuerpo);
    return;
  }

  const asunto = "🔴 Falló el rescate del borrador en un cierre automático";
  const cuerpo =
    `${canal} se cerró (${porque}) y el rescate del borrador NO pudo completarse.\n\n` +
    `${quien}\n\n` +
    `Resultado: ${info.resultado}\n` +
    `Detalle: ${info.detalle ?? "sin detalle"}\n\n` +
    `La consulta SÍ quedó cerrada — el cierre nunca se frena por esto. Lo que puede haber quedado sin entregar son los documentos.\n\n` +
    `QUÉ HACER: revisar el borrador de ese encuentro (se conserva a propósito) y emitir a mano lo que corresponda.`;
  await sendDoctoAlert(asunto, cuerpo);
}

/** Alerta mínima cuando ni siquiera se pudo armar el contexto del aviso. */
async function avisarAlEquipoQueFalloElRescate(
  args: { tipo: CanalRescate; id: string; origen: OrigenCierreAutomatico },
  detalle: string
): Promise<void> {
  await sendDoctoAlert(
    "🔴 Falló el rescate del borrador en un cierre automático",
    `Se cerró ${args.tipo === "turno" ? "un turno" : "una consulta"} automáticamente (${ORIGEN_EN_CRIOLLO[args.origen]}) y el rescate del borrador se cayó antes de poder hacer nada.\n\n` +
      `${args.tipo === "turno" ? "Turno" : "Consulta"}: ${args.id}\n` +
      `Detalle: ${detalle}\n\n` +
      `El cierre ocurrió igual. Lo que hay que revisar a mano es si ese encuentro tenía cosas escritas sin entregar.`
  );
}
