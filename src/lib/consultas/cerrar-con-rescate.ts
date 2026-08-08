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
// Y hay un QUINTO caso que no es un cierre automático sino su espejo: el
// profesional SÍ apretó "Finalizar", pero el guardado de documentos —que corre
// en background, después del redirect al dashboard— nunca terminó. El encuentro
// queda cerrado "por el médico", con el borrador entero adentro y el paciente
// sin nada. Para eso está `rescatarLoEscritoQueNuncaSeEntrego()`, el repaso
// nocturno que barre encuentros ya cerrados sin un solo documento emitido.
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
import { sendDoctoAlert, sendDoctoAlertThrottled } from "@/lib/alertas";
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
  /**
   * Repaso nocturno de encuentros YA cerrados a los que nunca se les entregó
   * nada (`rescatarLoEscritoQueNuncaSeEntrego`). Es la red de último recurso:
   * cubre el cierre marcado como "medico" cuyo guardado en background nunca
   * terminó —pestaña cerrada, móvil que congela la pestaña de fondo, insert
   * fallido— y también cualquier rescate en vivo que se haya caído.
   */
  | "repaso_sin_entrega"
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
  /**
   * Había un certificado de reposo escrito pero SIN los días cargados. No se
   * emite: los días son un dato jurídico obligatorio (art. 210 LCT) y el cierre
   * normal del profesional también lo bloquea. Ver `armarDocumentos`.
   */
  certificado_omitido_sin_dias: boolean;
  detalle?: string;
  rescatado_at: string;
};

/** Texto humano de cada origen, para los avisos. */
const ORIGEN_EN_CRIOLLO: Record<OrigenCierreAutomatico, string> = {
  desconexion: "se cortó la conexión y pasaron 2 minutos sin que nadie volviera",
  webhook_video: "la sala de video quedó vacía y se cerró sola",
  cierre_automatico: "quedó abierta más de 4 horas y la cerró el repaso nocturno",
  rejoin_expirado: "quedó con un corte pendiente y la cerró el repaso de respaldo",
  repaso_sin_entrega: "se cerró y lo escrito nunca llegó a enviarse; lo encontró el repaso nocturno",
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
    certificado_omitido_sin_dias: false,
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

/**
 * ¿El profesional ya había apretado "Finalizar" cuando este camino llegó a
 * cerrar el encuentro?
 *
 * El DELETE de la sala (`/api/livekit/crear-sala`) deja `cierre_origen='medico'`
 * ANTES de borrarla, justo porque borrarla dispara el cierre automático. Si esa
 * marca está puesta, la emisión de documentos es del flujo del profesional y
 * este camino NO debe rescatar: rescatar sería duplicar recetas firmadas.
 *
 * SOLO para los cierres EN VIVO (polling de desconexión, webhook de video). Los
 * crons cierran horas después: ahí la marca ya es historia —el guardado en
 * background del profesional murió hace rato— y saltear el rescate por ella
 * dejaría al paciente sin nada. Los crons rescatan igual; su red es el chequeo
 * de documentos ya existentes.
 *
 * Ante un error de lectura devuelve `false` (o sea: rescatar). No duplica igual,
 * porque el otro lado de la carrera —el guardado del profesional en
 * `WorkspaceConsulta`— se abstiene cuando ve que el encuentro lo cerró un camino
 * automático.
 */
export async function elMedicoYaEstabaFinalizando(
  tipo: CanalRescate,
  id: string
): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from(tipo === "turno" ? "turnos" : "consultas")
      .select("cierre_origen")
      .eq("id", id)
      .maybeSingle();
    if (error) {
      logWarn("[RESCATE]", "No se pudo leer cierre_origen antes de cerrar", { tipo, id, error: error.message });
      return false;
    }
    return data?.cierre_origen === "medico";
  } catch {
    return false;
  }
}

// ─── Repaso nocturno: lo que se cerró y nunca se entregó ─────────────────────

/**
 * Red de último recurso, pensada para el agujero que deja el camino feliz.
 *
 * Cuando el profesional aprieta "Finalizar", la emisión de documentos corre en
 * background DESPUÉS del redirect al dashboard. Si ese bloque no termina —cierra
 * la pestaña, el navegador del celular congela la página al mandarla al fondo, o
 * el insert falla— el encuentro queda cerrado, con el borrador intacto y sin un
 * solo documento para el paciente. Nadie se entera: es exactamente el caso que
 * originó esta auditoría, y los cierres automáticos no lo ven porque el
 * encuentro ya figura cerrado.
 *
 * Este repaso lo busca y lo resuelve: encuentros cerrados, cobrados, con
 * contenido clínico escrito y sin ningún documento clínico emitido.
 *
 * PRUDENCIA DELIBERADA
 *  - `minutosDeGracia`: no toca cierres recientes; el guardado en background del
 *    profesional puede estar corriendo todavía.
 *  - `mp_status='approved'`: solo encuentros efectivamente cobrados. No emite
 *    documentación clínica firmada sobre algo que no se pagó.
 *  - `limite`: la corrida está acotada. Lo que sobra queda para la próxima (el
 *    candidato sigue siéndolo mientras no tenga documentos).
 */
export async function rescatarLoEscritoQueNuncaSeEntrego(opts?: {
  limite?: number;
  minutosDeGracia?: number;
  diasHaciaAtras?: number;
}): Promise<RescateInfo[]> {
  const limite = opts?.limite ?? 15;
  const minutosDeGracia = opts?.minutosDeGracia ?? 60;
  const diasHaciaAtras = opts?.diasHaciaAtras ?? 7;

  const admin = createAdminClient();
  const hasta = new Date(Date.now() - minutosDeGracia * 60 * 1000).toISOString();
  const desde = new Date(Date.now() - diasHaciaAtras * 24 * 60 * 60 * 1000).toISOString();

  const candidatos: { tipo: CanalRescate; id: string }[] = [];

  for (const tipo of ["consulta", "turno"] as const) {
    if (candidatos.length >= limite) break;
    const tabla = tipo === "turno" ? "turnos" : "consultas";
    const columnaAncla = tipo === "turno" ? "turno_id" : "consulta_id";
    const estadoCerrado = tipo === "turno" ? "completado" : "completada";

    const { data, error } = await admin
      .from(tabla)
      .select("id, doc_borrador")
      .eq("estado", estadoCerrado)
      .eq("mp_status", "approved")
      .not("doc_borrador", "is", null)
      .gte("completada_at", desde)
      .lte("completada_at", hasta)
      .order("completada_at", { ascending: false })
      .limit(limite * 3);

    if (error) {
      logError("[RESCATE]", "No se pudo buscar encuentros cerrados sin entregar", {
        tabla,
        error: error.message,
      });
      continue;
    }

    for (const fila of data ?? []) {
      if (candidatos.length >= limite) break;
      if (!hayContenidoClinico((fila.doc_borrador ?? {}) as BorradorClinico)) continue;

      const { data: docs, error: errDocs } = await admin
        .from("documentos")
        .select("id")
        .eq(columnaAncla, fila.id)
        .in("tipo", [...TIPOS_FIRMABLES])
        .limit(1);

      // Ante la duda no se emite: duplicar recetas es peor que reintentar mañana.
      if (errDocs || (docs ?? []).length > 0) continue;

      candidatos.push({ tipo, id: fila.id });
    }
  }

  if (candidatos.length === 0) return [];

  logWarn("[RESCATE]", "Encuentros cerrados con lo escrito sin entregar: los rescata el repaso", {
    cantidad: candidatos.length,
  });

  const salida: RescateInfo[] = [];
  for (const c of candidatos) {
    salida.push(await rescatarBorradorAlCerrar({ ...c, origen: "repaso_sin_entrega" }));
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

  const { filas, recetaOmitidaSinCuil, certificadoOmitidoSinDias } = armarDocumentos(
    borrador,
    contexto.pacienteTieneCuil
  );

  if (filas.length === 0) {
    // Se llega acá cuando lo ÚNICO escrito era algo que no se puede emitir: una
    // receta sin CUIL del paciente, o un certificado sin los días de reposo.
    const motivos: string[] = [];
    if (recetaOmitidaSinCuil) motivos.push("había receta escrita pero el paciente no tiene CUIL cargado");
    if (certificadoOmitidoSinDias)
      motivos.push("había un certificado escrito pero sin los días de reposo cargados");

    const info: RescateInfo = {
      ...base,
      resultado: "sin_contenido",
      evolucion_guardada: evolucionGuardada,
      receta_omitida_sin_cuil: recetaOmitidaSinCuil,
      certificado_omitido_sin_dias: certificadoOmitidoSinDias,
      detalle: motivos.join("; ") || undefined,
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
    const info: RescateInfo = {
      ...base,
      resultado: "error",
      detalle,
      evolucion_guardada: evolucionGuardada,
      receta_omitida_sin_cuil: recetaOmitidaSinCuil,
      certificado_omitido_sin_dias: certificadoOmitidoSinDias,
    };
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
    certificado_omitido_sin_dias: certificadoOmitidoSinDias,
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
 * DOS OMISIONES, las dos deliberadas y las dos avisadas:
 *
 *   1. RECETA SIN CUIL. Igual que en el cierre normal: una receta sin CUIL del
 *      paciente no se puede emitir.
 *
 *   2. CERTIFICADO SIN DÍAS DE REPOSO. Los días son un dato jurídico obligatorio
 *      (art. 210 LCT) y el cierre normal los EXIGE: `validarCamposObligatorios()`
 *      en `WorkspaceConsulta` no deja finalizar si el profesional escribió el
 *      certificado y no eligió las horas o los días. Acá pasa seguido: el
 *      autoguardado corre cada 5 s y persiste `dias_reposo: null` mientras el
 *      profesional todavía no tocó el chip. Si emitiéramos igual, el PDF
 *      (`src/lib/pdf/receta.ts`) renderiza `doc.dias_reposo ?? 0` → "0 días de
 *      reposo laboral" y un rango de un solo día: un certificado laboral que el
 *      profesional NUNCA escribió, sellado con su firma y su matrícula. El
 *      rescate no inventa contenido clínico: lo omite y lo avisa.
 *
 * Con los días cargados el certificado sale idéntico al del cierre normal
 * (`contenido` puede venir vacío si el profesional solo eligió los días: el PDF
 * cae a `tratamiento`, y ahí las indicaciones son el fallback de siempre).
 */
function armarDocumentos(
  b: BorradorClinico,
  pacienteTieneCuil: boolean
): { filas: FilaDocumento[]; recetaOmitidaSinCuil: boolean; certificadoOmitidoSinDias: boolean } {
  const diagnostico = texto(b.diagnostico);
  const receta = texto(b.receta);
  const indicaciones = texto(b.indicaciones);
  const certificado = texto(b.certificado);
  const orden = texto(b.orden);
  const dias = diasReposoValidos(b.dias_reposo);

  const filas: FilaDocumento[] = [];
  const recetaOmitidaSinCuil = !!receta && !pacienteTieneCuil;
  const certificadoOmitidoSinDias = !!certificado && dias === null;

  if (receta && pacienteTieneCuil) filas.push({ tipo: "receta", contenido: receta });
  if (indicaciones) filas.push({ tipo: "indicaciones", contenido: indicaciones });
  if (dias !== null) {
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

  return { filas, recetaOmitidaSinCuil, certificadoOmitidoSinDias };
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

  // Lo que NO se pudo emitir, en criollo y con qué hacer. Los dos casos tienen la
  // misma forma: el profesional lo escribió, falta un dato y sin ese dato el
  // documento no se puede emitir.
  const faltantes: string[] = [];
  if (info.receta_omitida_sin_cuil) {
    faltantes.push(
      `· La RECETA no se envió: el paciente todavía no tiene el CUIL cargado y sin CUIL no se puede emitir.`
    );
  }
  if (info.certificado_omitido_sin_dias) {
    faltantes.push(
      `· El CERTIFICADO de reposo no se envió: te faltó elegir las horas o los días de reposo. ` +
        `Sin ese dato el certificado no tiene validez laboral, así que preferimos no mandarlo antes que mandarlo mal.`
    );
  }
  const bloqueFaltantes = faltantes.length
    ? `\n\nOJO, esto quedó sin enviar:\n${faltantes.join("\n")}\n\nEscribinos y lo emitimos bien.`
    : "";

  let titulo: string;
  let cuerpo: string;
  // 'alta' solo cuando hay algo concreto para revisar o corregir. Un cierre sin
  // nada escrito suele ser un paciente que no apareció: eso no amerita una
  // alerta roja en la bandeja del profesional.
  let severidad: "info" | "media" | "alta";

  if (info.resultado === "emitido") {
    titulo = "Cerramos tu consulta y le enviamos lo que habías escrito";
    severidad = "alta";
    cuerpo =
      `${hola}Tu consulta con ${contexto.pacienteNombre} terminó sin que pudieras tocar "Finalizar": ${porque}.\n\n` +
      `Para que el paciente no se quedara sin nada, le enviamos ${info.documentos_emitidos === 1 ? "el documento" : `los ${info.documentos_emitidos} documentos`} que ya habías escrito, tal cual quedaron guardados.\n\n` +
      `Te pedimos que los revises en la ficha del paciente. Si falta algo o querés corregirlo, escribinos y lo resolvemos.` +
      bloqueFaltantes;
  } else if (faltantes.length > 0) {
    // Escribió algo, pero nada de lo escrito se podía emitir tal como estaba.
    titulo = "Tu consulta se cerró sola y quedó algo sin enviar";
    severidad = "alta";
    cuerpo =
      `${hola}Tu consulta con ${contexto.pacienteNombre} terminó sin que pudieras tocar "Finalizar": ${porque}.` +
      bloqueFaltantes;
  } else {
    titulo = "Tu consulta se cerró sola";
    severidad = "info";
    cuerpo =
      `${hola}Tu consulta con ${contexto.pacienteNombre} terminó sin que pudieras tocar "Finalizar": ${porque}.\n\n` +
      `No había nada escrito, así que no le enviamos ningún documento al paciente.\n\n` +
      `Si el paciente no apareció, no tenés que hacer nada. Si llegaste a atenderlo y querés mandarle algo, escribinos y lo resolvemos juntos.`;
  }

  const { error } = await admin.from("mensajes_internos_medicos").insert({
    medico_id: contexto.medicoId,
    titulo,
    cuerpo,
    severidad,
  });

  if (error) {
    logError("[RESCATE]", "No se pudo dejar el mensaje interno al profesional", {
      medicoId: contexto.medicoId,
      error: error.message,
    });
  }

  // Push solo cuando hay algo que hacer. Un cierre sin nada escrito ya quedó en
  // la bandeja como aviso 'info'; no hace falta vibrarle el teléfono por eso.
  if (severidad === "info") return;

  try {
    await pushAlMedico(contexto.medicoId, {
      title: "Docto — revisá una consulta",
      body:
        info.resultado === "emitido"
          ? "Tu consulta se cerró sola. Enviamos al paciente lo que habías escrito: revisalo."
          : "Tu consulta se cerró sola y quedó algo escrito sin enviar: revisalo.",
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

  // Lo escrito que NO se pudo emitir, para el mail del equipo.
  const noEmitido =
    (info.receta_omitida_sin_cuil
      ? `\n⚠️ HABÍA UNA RECETA Y NO SE PUDO EMITIR: el paciente no tiene CUIL cargado. Sin CUIL no se puede emitir receta. Hay que pedirle el dato y reemitirla.\n`
      : "") +
    (info.certificado_omitido_sin_dias
      ? `\n⚠️ HABÍA UN CERTIFICADO DE REPOSO Y NO SE PUDO EMITIR: el profesional escribió el cuerpo pero no llegó a elegir los días. Los días son obligatorios (art. 210 LCT) y el cierre normal también los exige; emitirlo igual habría mandado un certificado de "0 días" que nadie escribió. Hay que pedirle los días y reemitirlo.\n`
      : "");

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
      noEmitido +
      `\nQUÉ HACER: al profesional ya le avisamos para que revise lo enviado. Conviene confirmar con él que lo que salió es lo que quería mandar, sobre todo si es una receta o un certificado.`;
    await sendDoctoAlert(asunto, cuerpo);
    return;
  }

  if (info.resultado === "sin_contenido") {
    // Escribió algo que no se podía emitir tal cual → mail directo, hay una
    // acción concreta (pedir el CUIL, pedir los días) y es raro.
    if (noEmitido) {
      await sendDoctoAlert(
        "⚠️ Una consulta se cerró sola y quedó contenido escrito sin poder emitirse",
        `${canal} se cerró sin que el profesional tocara "Finalizar": ${porque}.\n\n${quien}\n` +
          noEmitido +
          `\nQUÉ HACER: conseguir el dato que falta y reemitir. Al profesional ya le avisamos.`
      );
      return;
    }

    // Sin nada escrito. Esto NO es raro: es el caso típico del paciente que no
    // apareció y la sala se cerró sola. Un mail por encuentro convierte una
    // corrida de cron con 20 huérfanas en 20 mails y termina en ruido que nadie
    // lee. Throttle durable de 6 h (mismo mecanismo que las alertas de servicio).
    const asunto = "⚠️ Una consulta se cerró sola y el paciente quedó sin documentos";
    const cuerpo =
      `${canal} se cerró sin que el profesional tocara "Finalizar": ${porque}.\n\n` +
      `En el borrador no había contenido clínico, así que no se emitió nada: el paciente quedó SIN documentos.\n\n` +
      `${quien}\n` +
      (info.detalle ? `\nDetalle: ${info.detalle}\n` : "") +
      `\nQUÉ HACER: mirar si la consulta llegó a ocurrir. Si el paciente pagó y no lo atendieron, corresponde reembolso. Si el paciente no apareció, no hay nada que hacer.\n` +
      `\nNOTA: este aviso se manda como mucho una vez cada 6 horas. Si hubo varios cierres sin documentación en ese lapso, solo ves el primero — el listado completo sale del panel admin (cierres automáticos) y del log del cron.`;
    await sendDoctoAlertThrottled(`rescate-sin-contenido-${info.tipo}`, 6, asunto, cuerpo);
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
