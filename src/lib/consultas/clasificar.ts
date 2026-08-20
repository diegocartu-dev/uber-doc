// La escalera de una atención: Búsqueda → Intento → Consulta.
//
// REGLA (decisión de Diego, 19/08/2026): un pedido NO es una consulta hasta que
// el profesional lo acepta. Antes de eso es un INTENTO — el paciente buscó y
// pidió, pero del otro lado todavía no hubo nadie. Contar los intentos como
// consultas mezcla la demanda con lo que efectivamente entregamos, y esconde
// justo el número que importa: cuántos pedidos acepta un profesional.
//
// Una vez aceptada, la consulta tiene dos caminos —paga o no paga— y si paga,
// tres desenlaces: la atendieron, se fue el profesional, o se fue el paciente.
//
// ── POR QUÉ ESTE MÓDULO EXISTE ───────────────────────────────────────────────
// El vocabulario ya estaba en el enum de `consultas` (`no_show_paciente`,
// `medico_ausente`) y nunca se usó: TODO terminaba aplastado en `completada` o
// `cancelada`. Peor: `aceptada_at` jamás se escribió, así que el hito que separa
// un intento de una consulta no dejaba rastro. Mirando una consulta cancelada
// era imposible saber si alguien la había aceptado.
//
// Este módulo NO cambia estados: los lee. Cambiar el `estado` que se escribe
// tocaría los ~20 archivos que hoy lo interpretan (guards de "una atención por
// vez", crons, pantallas del paciente y del profesional). La clasificación vive
// en columnas dedicadas que se escriben ADEMÁS del estado, y acá se computa.
//
// Fuente de verdad única: todo reporte, filtro o pantalla que necesite decir
// "esto fue una consulta" usa `clasificarAtencion`, no una lista de estados
// escrita a mano.

/** Quién resolvió la atención. Se escribe en `resuelta_por`. */
export type ResueltaPor = "paciente" | "medico" | "admin" | "sistema";

/**
 * Por qué terminó como terminó. Se escribe en `resolucion_motivo`.
 * Snake_case, igual que los valores que ya usa `turnos` (`paciente_ausente`,
 * `medico_ausente`).
 */
export const MOTIVO = {
  /** El paciente canceló su propia solicitud desde la sala de espera. */
  RETIRO_PACIENTE: "retiro_paciente",
  /** El paciente dejó a este profesional para pedirle a otro (regla del Uber). */
  CAMBIO_PROFESIONAL: "cambio_profesional",
  /** El profesional canceló una consulta que ya había aceptado. */
  CANCELO_PROFESIONAL: "cancelo_profesional",
  /** Cancelación hecha desde el panel de administración. */
  CANCELACION_ADMIN: "cancelacion_admin",
} as const;

export type Motivo = (typeof MOTIVO)[keyof typeof MOTIVO];

/** Dónde cae en la escalera. */
export type Nivel = "intento" | "consulta";

export type Desenlace =
  /** Intento: nadie lo aceptó. Es una falla de oferta NUESTRA. */
  | "sin_respuesta"
  /** Intento: el paciente se fue antes de que lo aceptaran. Ruido normal. */
  | "retirado"
  /** Consulta: la aceptaron y el paciente no llegó a pagar. */
  | "abandono"
  /** Consulta: ocurrió. */
  | "atendida"
  /** Consulta paga que el profesional no sostuvo. */
  | "medico_se_fue"
  /** Consulta paga a la que el paciente no llegó. */
  | "paciente_se_fue"
  /** Consulta paga que se canceló antes de que se registrara quién la cerró. */
  | "sin_datos"
  /** Todavía viva: no terminó de definirse. */
  | "en_progreso";

export type FilaAtencion = {
  estado: string;
  aceptada_at?: string | null;
  resuelta_por?: string | null;
  resolucion_motivo?: string | null;
  pago_id?: string | null;
  mp_status?: string | null;
  sala_video_url?: string | null;
  en_curso_at?: string | null;
};

export type Clasificacion = {
  nivel: Nivel;
  desenlace: Desenlace;
  /** Un profesional se hizo cargo. Es la frontera intento/consulta. */
  fueAceptada: boolean;
  /** Hay plata acreditada. */
  fuePagada: boolean;
  /**
   * Cómo se supo que fue aceptada. `hito` = lo dice `aceptada_at`.
   * `inferido` = la fila es anterior al registro del hito y se dedujo del pago
   * o de la sala. `no` = no fue aceptada.
   *
   * Importa para los reportes: sobre datos viejos, "sin_respuesta" y "retirado"
   * NO son distinguibles con certeza — sólo desde que se registra el hito.
   */
  origenAceptacion: "hito" | "inferido" | "no";
};

/** Estados en los que la atención todavía no se definió. */
const VIVOS = new Set(["esperando", "aceptada", "pagada", "en_curso"]);

/**
 * ¿El paciente llegó a pagar?
 *
 * `approved` es plata adentro. `refunded` y `charged_back` también cuentan acá:
 * son estados POSTERIORES a un pago acreditado —para devolverla, primero entró—
 * y sin ellos una consulta cobrada y reembolsada se clasificaría como "nunca
 * llegó a pagar", que es exactamente lo contrario de lo que pasó.
 *
 * Lo que NO cuenta es la plata en camino (`in_process`, `authorized`,
 * `pending`): MP todavía no la acreditó.
 *
 * OJO: esto responde "¿pagó?", no "¿cuánta plata entró?". El ingreso lo mide
 * `lib/insights/plata.ts`, que filtra solo por `approved`.
 */
const PAGO_HECHO = new Set(["approved", "refunded", "charged_back"]);

function huboPago(fila: FilaAtencion): boolean {
  return PAGO_HECHO.has(fila.mp_status ?? "");
}

/**
 * ¿Se hizo cargo un profesional?
 *
 * El dato directo es `aceptada_at`. Para las filas anteriores al registro del
 * hito se infiere: el pago y la sala de video sólo existen DESPUÉS de que el
 * profesional acepta (el paciente recién puede pagar cuando ya lo aceptaron),
 * así que cualquiera de los dos prueba la aceptación. Lo que no se puede
 * reconstruir hacia atrás es el caso inverso: una fila sin pago ni sala puede
 * ser tanto "nunca la aceptaron" como "la aceptaron y no llegó a pagar".
 */
function detectarAceptacion(fila: FilaAtencion): Clasificacion["origenAceptacion"] {
  if (fila.aceptada_at) return "hito";
  if (fila.pago_id || fila.sala_video_url || fila.en_curso_at) return "inferido";
  return "no";
}

export function clasificarAtencion(fila: FilaAtencion): Clasificacion {
  const origenAceptacion = detectarAceptacion(fila);
  const fueAceptada = origenAceptacion !== "no";
  const fuePagada = huboPago(fila);
  const viva = VIVOS.has(fila.estado);

  const base = { fueAceptada, fuePagada, origenAceptacion };

  // ── INTENTO: nunca hubo un profesional del otro lado ──────────────────────
  if (!fueAceptada) {
    if (viva) return { ...base, nivel: "intento", desenlace: "en_progreso" };
    // Quién la cerró es lo que separa "se fue solo" de "no lo atendió nadie".
    // Sin `resuelta_por` (filas viejas) el default es `sin_respuesta`: es el
    // caso que hay que ver, y darlo por "el paciente se fue" lo escondería.
    const seFueSolo =
      fila.resuelta_por === "paciente" &&
      fila.resolucion_motivo !== MOTIVO.CANCELO_PROFESIONAL;
    return {
      ...base,
      nivel: "intento",
      desenlace: seFueSolo ? "retirado" : "sin_respuesta",
    };
  }

  // ── CONSULTA: un profesional se hizo cargo ────────────────────────────────
  if (fila.estado === "completada") {
    return { ...base, nivel: "consulta", desenlace: "atendida" };
  }
  if (fila.estado === "medico_ausente") {
    return { ...base, nivel: "consulta", desenlace: "medico_se_fue" };
  }
  if (fila.estado === "no_show_paciente") {
    return { ...base, nivel: "consulta", desenlace: "paciente_se_fue" };
  }
  if (viva) {
    return { ...base, nivel: "consulta", desenlace: "en_progreso" };
  }

  // Cancelada (o interrumpida) después de haber sido aceptada.
  if (!fuePagada) {
    // Aceptada y sin plata: el paciente no completó el pago — se fue de la
    // pantalla o se cayó dentro del checkout de Mercado Pago. Los dos casos se
    // separan cruzando con los eventos del funnel, no desde acá.
    return { ...base, nivel: "consulta", desenlace: "abandono" };
  }
  if (fila.resuelta_por === "medico") {
    return { ...base, nivel: "consulta", desenlace: "medico_se_fue" };
  }
  if (fila.resuelta_por === "paciente") {
    return { ...base, nivel: "consulta", desenlace: "paciente_se_fue" };
  }
  // Paga, cancelada, y nadie registró quién: sólo pasa con filas anteriores al
  // registro. Decir "el paciente no llegó" sería inventar un culpable.
  return { ...base, nivel: "consulta", desenlace: "sin_datos" };
}

/**
 * La misma escalera, aplicada a un TURNO.
 *
 * Un turno no tiene "aceptación": el profesional publicó su agenda, o sea que
 * ya aceptó de antemano a cualquiera que tome un lugar. Lo que separa el
 * intento de la consulta acá es el PAGO — decisión de Diego del 10/08/2026,
 * "el pago es fundacional para decir que este paciente consume este turno".
 *
 * Los estados de `turnos` ya distinguen quién dejó caer la atención
 * (`cancelado_paciente` vs `cancelado_medico`, `ausente_*`), así que no hace
 * falta deducirlo: se traduce.
 *
 * OJO: las reservas ABANDONADAS (retención vencida sin pago) no deberían llegar
 * hasta acá — se filtran antes con `lib/insights/reservas.ts`, porque no son ni
 * intentos: son las vueltas de un paciente indeciso.
 */
export function clasificarTurno(fila: FilaAtencion): Clasificacion {
  const fuePagada = huboPago(fila);
  // El turno no registra aceptación, y no hace falta inventarla: la agenda
  // publicada ES la aceptación.
  const base = {
    fueAceptada: fuePagada,
    fuePagada,
    origenAceptacion: (fuePagada ? "inferido" : "no") as Clasificacion["origenAceptacion"],
  };

  // Sin pago no hay turno consumido: sigue siendo un intento.
  if (!fuePagada) {
    if (fila.estado === "reservado_pendiente") {
      return { ...base, nivel: "intento", desenlace: "en_progreso" };
    }
    if (fila.estado === "cancelado_medico") {
      return { ...base, nivel: "intento", desenlace: "sin_respuesta" };
    }
    return { ...base, nivel: "intento", desenlace: "retirado" };
  }

  switch (fila.estado) {
    case "completado":
      return { ...base, nivel: "consulta", desenlace: "atendida" };
    case "ausente_medico":
    case "cancelado_medico":
      return { ...base, nivel: "consulta", desenlace: "medico_se_fue" };
    case "ausente_paciente":
    case "cancelado_paciente":
      return { ...base, nivel: "consulta", desenlace: "paciente_se_fue" };
    default:
      // confirmado / en_espera / en_curso / reprogramado: pagado y todavía en
      // camino. El reprogramado se resuelve en la fila del turno nuevo.
      return { ...base, nivel: "consulta", desenlace: "en_progreso" };
  }
}

/** Etiquetas para pantalla. */
export const DESENLACE_LABEL: Record<Desenlace, string> = {
  sin_respuesta: "No la aceptó nadie",
  retirado: "El paciente se retiró",
  abandono: "Aceptada, sin pagar",
  atendida: "Atendida",
  medico_se_fue: "El profesional no sostuvo",
  paciente_se_fue: "El paciente no llegó",
  sin_datos: "Cancelada (sin registro)",
  en_progreso: "En curso",
};

export const NIVEL_LABEL: Record<Nivel, string> = {
  intento: "Intento de consulta",
  consulta: "Consulta",
};

/** ¿Cuenta como consulta para los totales del tablero? */
export function esConsulta(fila: FilaAtencion): boolean {
  return clasificarAtencion(fila).nivel === "consulta";
}

/**
 * ¿Es una atención que efectivamente ocurrió? Más estricto que `esConsulta`:
 * deja afuera las aceptadas que nunca se pagaron, para que el total de
 * "consultas" no se infle con las que no generaron ni plata ni atención.
 */
export function esAtencionReal(fila: FilaAtencion): boolean {
  const c = clasificarAtencion(fila);
  return c.nivel === "consulta" && c.desenlace !== "abandono";
}
