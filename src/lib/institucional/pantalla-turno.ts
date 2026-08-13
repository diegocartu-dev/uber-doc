// src/lib/institucional/pantalla-turno.ts
// Qué ve el paciente institucional cuando entra por su link — parte PURA.
//
// El mock aprobado (mocks/02-paciente.html §2) es "un solo layout, seis
// estados". Cuál de los seis se muestra sale de dos cosas: el estado del turno
// y el reloj. Eso es lo que decide esta función, sin tocar la base ni React,
// para que la regla se pueda leer —y testear— de un saque.
//
// Letras del mock:
//   A "falta"     — todavía no abre la ventana. Ningún botón muerto.
//   B "ventana"   — puede entrar.
//   C  permisos   — NO está acá: es el pre-join del canal clínico, que vive en
//                   SalaConsultaPaciente y no se toca.
//   D "espera"    — ya entró; espera al profesional.
//   E "terminado" — el encuentro pasó; quedan los documentos.
//   F "inactivo"  — el link no lleva a ningún lado (reprogramado, cancelado).
//   + "sala"      — no es un estado de esta pantalla: hay que mandarlo al video.
//
// El mock tiene seis estados porque no contempló las AUSENCIAS, y resolverlas
// mapeándolas al más parecido producía el mensaje equivocado en el peor
// momento: a alguien que estuvo esperando y a quien nadie atendió se le decía
// "Tu consulta terminó" y "no quedó documentación cargada", como si lo hubieran
// atendido. Por eso hay dos pantallas más, con copy propio y una salida real.

export type PantallaTurno =
  | "falta"
  | "ventana"
  | "espera"
  | "sala"
  | "terminado"
  | "ausente-profesional"
  | "ausente-paciente"
  | "inactivo";

/**
 * ESTADOS EN LOS QUE EL TURNO YA NO RECIBE A NADIE — la única lista.
 *
 * El turno se reprogramó o se canceló: existe (o va a existir) OTRO turno con
 * su propio link. Mandar al paciente a este sería mandarlo a un lugar muerto,
 * así que la pantalla es la misma que la de un link vencido.
 *
 * `disponible`, `bloqueado` y `bloqueado_sin_cobro` entran acá por la misma
 * razón: son estados de un slot SIN paciente — si el turno volvió ahí, este
 * link ya no es de nadie.
 *
 * ── POR QUÉ SE EXPORTA ───────────────────────────────────────────────────────
 * Esta misma regla ("el link murió con el encuentro") se escribía DOS veces:
 * acá y en `accesos.ts`, en la validación del token. Las dos copias ya
 * divergían en el primer commit que las creó — a la de accesos.ts le faltaba
 * `bloqueado_sin_cobro`, así que un turno en ese estado pasaba la validación,
 * el POST hacía generateLink + verifyOtp y se creaba una sesión de verdad…
 * para después mostrarle "este enlace ya no está activo". Botón vivo que no
 * lleva a nada (lo que el mock prohíbe) más una credencial emitida al pedo.
 *
 * Es UNA sola pregunta: vive acá, y accesos.ts la importa.
 */
export const ESTADOS_TURNO_MUERTO = new Set([
  "reprogramado",
  "cancelado_paciente",
  "cancelado_medico",
  "disponible",
  "bloqueado",
  "bloqueado_sin_cobro",
]);

/** ¿El turno murió y su link con él? Los dos consumidores preguntan por acá. */
export function turnoMuerto(estado: string): boolean {
  return ESTADOS_TURNO_MUERTO.has(estado);
}

/**
 * Terminales "el encuentro ya pasó". NO son inactivos: es justo cuando el
 * paciente vuelve al link a buscar sus documentos, que es para lo que existen
 * los `vigencia_documentos_dias` del config.
 *
 * Los tres terminan el turno, pero NO terminan lo mismo: `completado` es la
 * consulta que ocurrió, `ausente_medico` es una falla de servicio nuestra y
 * `ausente_paciente` es un turno que se perdió. Cada uno tiene su pantalla.
 */
const TERMINADOS: Record<string, PantallaTurno> = {
  completado: "terminado",
  ausente_medico: "ausente-profesional",
  ausente_paciente: "ausente-paciente",
};

/**
 * ── LA VENTANA NO CIERRA, Y ES A PROPÓSITO ───────────────────────────────────
 * Esta función recibía además un `finMs` que calculaba el server component,
 * pasaba, y tiraba con un `void finMs`: un parámetro muerto que hacía pensar
 * que la puerta se cerraba al final del turno. No se cierra, y no debe: llegar
 * tarde —o que el profesional se demore— no puede dejar al paciente afuera de
 * su propia consulta. El que resuelve un turno abandonado es el cron de
 * vencidos, a los ~20 min de gracia; recién ahí la pantalla cambia sola.
 * El comentario de la migración 011 decía lo contrario y se corrigió.
 */
export function pantallaDelTurno(params: {
  estado: string;
  /** Instante de inicio del turno (ms). */
  inicioMs: number;
  /**
   * Instante contra el que se compara. Se puede omitir (usa el reloj): así el
   * `Date.now()` queda ACÁ y no adentro del render de un server component,
   * donde la regla de pureza de React lo marca. Los tests lo pasan siempre.
   */
  ahoraMs?: number;
  /** `ventana_entrada_min` del config: cuántos minutos antes se abre la puerta. */
  ventanaEntradaMin: number;
}): PantallaTurno {
  const { estado, inicioMs, ventanaEntradaMin } = params;
  const ahoraMs = params.ahoraMs ?? Date.now();

  if (ESTADOS_TURNO_MUERTO.has(estado)) return "inactivo";
  if (TERMINADOS[estado]) return TERMINADOS[estado];
  if (estado === "en_curso") return "sala";
  if (estado === "en_espera") return "espera";

  if (estado === "confirmado") {
    const abre = inicioMs - ventanaEntradaMin * 60_000;
    if (ahoraMs < abre) return "falta";
    return "ventana";
  }

  // `reservado_pendiente` no existe en la instancia (no hay pago que esperar) y
  // cualquier estado nuevo que aparezca no tiene por qué inventar una pantalla:
  // se trata como link que no lleva a ningún lado. Fail-safe, no adivinanza.
  return "inactivo";
}

/** Instante (ms) en que se abre la puerta — el "vas a poder entrar a las …". */
export function abreLaPuertaMs(inicioMs: number, ventanaEntradaMin: number): number {
  return inicioMs - ventanaEntradaMin * 60_000;
}

/**
 * "2026-10-20" + "16:30:00" → instante real en Argentina.
 * La instancia opera en AR: el offset es fijo (-03:00, sin horario de verano),
 * mismo criterio que el resto del repo.
 */
export function instanteAR(fecha: string, hora: string): number {
  const hhmmss = hora.length === 5 ? `${hora}:00` : hora.slice(0, 8);
  return new Date(`${fecha}T${hhmmss}-03:00`).getTime();
}
