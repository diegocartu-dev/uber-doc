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

export type PantallaTurno = "falta" | "ventana" | "espera" | "sala" | "terminado" | "inactivo";

/**
 * El turno se reprogramó o se canceló: existe (o va a existir) OTRO turno con
 * su propio link. Mandar al paciente a este sería mandarlo a un lugar muerto,
 * así que la pantalla es la misma que la de un link vencido.
 *
 * `disponible` y `bloqueado` entran acá por la misma razón: son estados de un
 * slot SIN paciente — si el turno volvió ahí, este link ya no es de nadie.
 */
const INACTIVOS = new Set([
  "reprogramado",
  "cancelado_paciente",
  "cancelado_medico",
  "disponible",
  "bloqueado",
  "bloqueado_sin_cobro",
]);

/**
 * Terminales "el encuentro ya pasó". NO son inactivos: es justo cuando el
 * paciente vuelve al link a buscar sus documentos, que es para lo que existen
 * los `vigencia_documentos_dias` del config.
 */
const TERMINADOS = new Set(["completado", "ausente_paciente", "ausente_medico"]);

export function pantallaDelTurno(params: {
  estado: string;
  /** Instante de inicio del turno (ms). */
  inicioMs: number;
  /** Instante de fin del turno (ms). */
  finMs: number;
  /**
   * Instante contra el que se compara. Se puede omitir (usa el reloj): así el
   * `Date.now()` queda ACÁ y no adentro del render de un server component,
   * donde la regla de pureza de React lo marca. Los tests lo pasan siempre.
   */
  ahoraMs?: number;
  /** `ventana_entrada_min` del config: cuántos minutos antes se abre la puerta. */
  ventanaEntradaMin: number;
}): PantallaTurno {
  const { estado, inicioMs, finMs, ventanaEntradaMin } = params;
  const ahoraMs = params.ahoraMs ?? Date.now();

  if (INACTIVOS.has(estado)) return "inactivo";
  if (TERMINADOS.has(estado)) return "terminado";
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
  void finMs;
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
