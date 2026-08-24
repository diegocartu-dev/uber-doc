// Qué cuenta como caída — la regla, aparte del cron para poder testearla.
//
// DEFINICIÓN (Diego, 23/08/2026): *"a qué llamamos caída: a que no se puedan
// cursar consultas normalmente"*.
//
// De ahí salen tres estados, y el del medio es el que hacía todo el ruido:
//
//   CAÍDA      el sitio o la base no responden, dos corridas seguidas → nadie
//              puede pedir ni cursar una consulta. Se avisa.
//   SIN MEDIR  el monitor no corrió. No se sabe nada del sistema — y no saber
//              NO es estar caído. No se avisa.
//   OK         todo responde.
//
// Medido sobre 26 días de alarmas reales (28/07 → 23/08/2026): de 49 avisos de
// "Docto volvió", **35 no tenían un solo rojo previo**. No eran caídas: eran
// huecos del programador de Vercel leídos como corte. 35 de esos 35 llegaron en
// los minutos :02 y :03 de la hora — una caída real no elige la hora en punto.

/** Corridas seguidas viendo lo mismo para declarar una caída. */
export const FALLOS_PARA_CONFIRMAR = 2;

/**
 * Hueco de latido a partir del cual se deduce que hubo un corte real.
 *
 * El cron corre CADA MINUTO. El valor anterior era 3 minutos: sin margen, y por
 * eso cualquier salteo del programador se leía como caída. Doce minutos deja
 * pasar los huecos normales y sigue detectando un corte de verdad, que dura
 * mucho más (los dos episodios reales de agosto: 112 y 317 minutos).
 */
export const HUECO_MS = 12 * 60 * 1000;

/**
 * Con la base caída no hay dónde anotar que ya avisamos, y Vercel recicla la
 * instancia entre corridas: un contador en memoria arranca en cero cada vez, y
 * así salieron 68 mails por UN episodio (15/08/2026). El reloj es el único freno
 * que sobrevive al reciclado.
 */
export const MINUTOS_ENTRE_ROJOS_SIN_ESTADO = 20;

/**
 * ¿Declaramos caída? Una sola corrida caída puede ser un blip del runner, un
 * cold start o un timeout puntual; dos seguidas ya son el sistema.
 *
 * Si el estado NO se puede leer, la base es justo lo que no responde: eso ya es
 * la señal, no hay contador que esperar.
 */
export function esCaidaConfirmada(params: {
  fallosSeguidos: number;
  estadoLegible: boolean;
}): boolean {
  if (!params.estadoLegible) return true;
  return params.fallosSeguidos >= FALLOS_PARA_CONFIRMAR;
}

/**
 * ¿Este hueco de latido es del programador (no corrió el cron) o fue un corte
 * real (no se pudo registrar nada mientras pasaba)?
 *
 * Devuelve `true` cuando es del programador — o sea, cuando NO hay que avisar
 * nada, porque no se cayó nada: sólo no se midió.
 */
export function esHuecoDeProgramador(huecoMs: number): boolean {
  return huecoMs <= HUECO_MS;
}
