// Qué pasó con una búsqueda de la pantalla "Demanda".
//
// ── POR QUÉ ESTO VIVE ACÁ Y NO ADENTRO DEL ROUTE ─────────────────────────────
// Esta decisión dejó de ser cosmética: desde que la fila NOMBRA al profesional,
// la etiqueta señala a una persona. "Nadie lo aceptó" es lo que va a disparar un
// aviso —y en algún momento una sanción—, así que cuál de las ramas gana tiene
// que ser verificable con un test y no por lectura del código.
//
// La regla de fondo: SOLO es imputable a un profesional el pedido que le llegó
// y no tomó. Elegirlo para un TURNO no le pide nada (el paciente reserva y
// paga, nadie acepta), y elegirlo sin llegar a mandar el pedido tampoco: del
// otro lado nunca sonó el teléfono.

/** Lo que la fila muestra para cada profesional elegido. */
export type DesenlacePedido =
  | "sin_respuesta"   // le llegó y no lo tomó — lo ÚNICO imputable
  | "retirado"        // el paciente se fue antes de que lo tomaran
  | "no_pidio"        // CI: lo eligió y nunca mandó el pedido
  | "no_reservo"      // turno: abrió su agenda y no reservó
  | "atendida"
  | "abandono"
  | "medico_se_fue"
  | "paciente_se_fue"
  | "sin_datos"
  | "en_progreso";

export type EntradaResultado = {
  provincia: string | null;
  /** Profesionales habilitados para su provincia en ese momento. */
  medicosProvincia: number;
  /** De esos, cuántos estaban en línea para CI en ese instante. */
  ciOnline: number;
  /** Hay al menos un profesional verificado en TODO el país. */
  hayOfertaEnElPais: boolean;
  seAtendio: boolean;
  pago: boolean;
  eligio: boolean;
  alguienAcepto: boolean;
  desenlaces: DesenlacePedido[];
};

export type ResultadoBusqueda = { resultado: string; matchHabia: boolean };

/**
 * `matchHabia` responde "¿la oferta estuvo?". Es false SOLO cuando el que falló
 * fuimos nosotros: no había profesional, no había ninguno en línea, o el pedido
 * llegó y nadie lo tomó. Que el paciente se vaya por su cuenta no es un fallo
 * de match, y contarlo como tal infla el número que mide nuestra deuda.
 */
export function decidirResultado(e: EntradaResultado): ResultadoBusqueda {
  const hay = e.desenlaces.length > 0;
  // `every` sobre una lista vacía es true: sin este `hay`, una sesión sin
  // ningún pedido caería en la primera rama que use `every` y se etiquetaría
  // sola. Es el bug que este archivo existe para no repetir.
  const todos = (d: DesenlacePedido) => hay && e.desenlaces.every((x) => x === d);

  if (!e.provincia) return { resultado: "sin provincia cargada", matchHabia: e.hayOfertaEnElPais };
  if (e.medicosProvincia === 0) return { resultado: "sin médicos para su provincia", matchHabia: false };
  if (e.seAtendio) return { resultado: "se atendió", matchHabia: true };
  if (e.pago) return { resultado: "pagó", matchHabia: true };

  if (e.eligio && !e.alguienAcepto) {
    // Todavía corriendo el plazo: nadie lo tomó AÚN. Decir "nadie lo aceptó"
    // sobre un pedido de hace dos minutos señala a un profesional que está en
    // tiempo — y esta pantalla ya no es solo un número, nombra personas.
    if (e.desenlaces.includes("en_progreso")) {
      return { resultado: "esperando que lo tomen", matchHabia: true };
    }
    // Un solo pedido sin tomar alcanza para que la búsqueda sea falla de
    // oferta, aunque el resto de la sesión sea ruido.
    if (e.desenlaces.includes("sin_respuesta")) {
      return { resultado: "eligió, nadie lo aceptó", matchHabia: false };
    }
    if (todos("no_reservo")) return { resultado: "eligió turno, no reservó", matchHabia: true };
    if (todos("no_pidio")) return { resultado: "eligió, no llegó a pedir", matchHabia: true };
    if (hay) return { resultado: "eligió, el paciente se retiró", matchHabia: true };
    // Eligió pero no quedó ni el nombre: sin a quién señalar, se mantiene la
    // lectura vieja (falla de oferta) porque es la que hay que ir a mirar.
    return { resultado: "eligió, nadie lo aceptó", matchHabia: false };
  }
  if (e.eligio) return { resultado: "eligió médico, no pagó", matchHabia: true };
  if (e.ciOnline === 0) return { resultado: "había médicos pero ninguno en línea", matchHabia: false };
  return { resultado: "había oferta, no eligió", matchHabia: true };
}
