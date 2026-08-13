import { NextResponse } from "next/server";
import { withCron } from "@/lib/cron-guard";
import { cortarSiB2C } from "@/lib/institucional/crons-institucionales";
import { cerrarMes, mesesPendientesDeSellar, type ResumenCierreMes } from "@/lib/metering/facturacion";
import { corridaDelBarrido, semanasDeLaCorrida } from "@/lib/metering/bolsa";

/**
 * Cron diario de las 04:00 ART — CIERRA TODO MES TERMINADO QUE SIGA ABIERTO (R31).
 *
 * "El mes se cierra solo, el último día a las 24:00. Nadie tiene que cerrar
 * nada a mano." El corte de datos es el mes calendario completo (hasta las
 * 23:59:59 del último día, hora argentina); el sello se estampa unas horas
 * después, ya en el día 1, porque el contador necesita terminar de clasificar
 * los últimos encuentros: una consulta que termina 23:55 se clasifica pasada la
 * medianoche. La foto siempre es del mes; lo que se demora es el revelado.
 *
 * ── POR QUÉ CORRE TODOS LOS DÍAS Y NO SOLO EL 1 ─────────────────────────────
 * Corría `0 5 1 * *` y cerraba SIEMPRE el mes anterior, sin volver nunca sobre
 * el que faltó. Dos agujeros, los dos rutinarios:
 *
 *   · El día 1 falla más seguido de lo que parece. La precondición cuenta como
 *     "vivo" cualquier encuentro no terminal del mes, y una CI que el
 *     profesional abrió a las 22:30 del 31 y nunca cerró sigue viva a la
 *     madrugada: `cerrar-huerfanas` corre a las 00:00 ART y solo cierra
 *     consultas con más de 4 h de `en_curso_at`, así que a esa hora todavía no
 *     la toca. El cierre abortaba —bien— pero después nadie reintentaba.
 *   · Y si el mail rojo de `withCron` se perdía (spam, vacaciones), el mes
 *     quedaba sin sellar indefinidamente y en silencio: el watchdog vigila el
 *     latido, y el cron latía.
 *
 * Corriendo todos los días, ese mismo mes se cierra solo el día 2: a las 00:00
 * `cerrar-huerfanas` cierra la CI colgada (ya tiene más de 4 h), el clasificador
 * la escribe dentro de los 15 minutos siguientes, y a las 04:00 el barrido
 * encuentra el mes pendiente y lo sella. Sin intervención humana, que es lo que
 * pide R31.
 *
 * ── POR QUÉ 04:00 ───────────────────────────────────────────────────────────
 * Después de `cerrar-huerfanas` (00:00 ART), que es lo único que terminaliza
 * una consulta que quedó abierta, y con margen de sobra para que el
 * clasificador —que espera 15 min tras el cierre y corre cada 10— escriba su
 * fila. Sellar antes del barrido es sellar a ciegas.
 *
 * (Los crons de Vercel se programan en UTC: `0 7 * * *` = 04:00 ART.)
 *
 * ── SI FALTA ALGO, NO SELLA: ABORTA Y AVISA ─────────────────────────────────
 * La precondición es la misma del cierre semanal, extendida al rango del mes:
 * si queda un encuentro terminal sin clasificar —o uno TODAVÍA VIVO del último
 * día— `cerrarMes` se niega. Ese mes queda en la lista y se reintenta mañana; y
 * mientras tanto el 500 llega al mail de `withCron` con el período y el motivo
 * adentro (el mail adjunta el cuerpo JSON de la respuesta). Una foto incompleta
 * sellada es inmutable; una foto que sale un día tarde, no es nada.
 *
 * Idempotente: si no hay ningún mes pendiente —el caso de 29 días de cada 30—
 * no toca nada y responde en dos queries.
 *
 * SOLO instancia institucional: en el B2C corta en la primera línea.
 */

export const maxDuration = 60;

/**
 * Meses que sella como mucho una corrida. Techo de tiempo, no de alcance: lo
 * que sobra se sella mañana. En régimen la lista tiene 0 o 1.
 */
const MAX_POR_CORRIDA = 3;

async function handler() {
  const corte = cortarSiB2C("metering-cerrar-mes");
  if (corte) return corte;

  let pendientes: string[];
  try {
    pendientes = await mesesPendientesDeSellar();
  } catch (err) {
    const detalle = err instanceof Error ? err.message : String(err);
    console.error("[cron/metering-cerrar-mes] No se pudo leer qué meses faltan:", detalle);
    return NextResponse.json({ error: detalle }, { status: 500 });
  }

  // El mismo reparto que usa el barrido semanal: lugar reservado para el mes
  // MÁS RECIENTE y el resto rotando entre los viejos. Sin esto, el día del
  // deploy hay ~13 meses sin marca, `slice` toma los 3 más viejos y el mes que
  // la institución va a mirar se sella recién 4 días después — cuatro días en
  // los que ese mes sigue siendo reescribible por el clasificador.
  const aCerrar = semanasDeLaCorrida(pendientes, MAX_POR_CORRIDA, corridaDelBarrido());
  const cerrados: ResumenCierreMes[] = [];
  const fallados: { periodo: string; error: string }[] = [];

  for (const periodo of aCerrar) {
    try {
      cerrados.push(await cerrarMes(periodo));
    } catch (err) {
      // Precondición incumplida o lectura fallida. No corta el barrido: un mes
      // trabado no puede impedir que se cierre otro que sí está listo.
      const detalle = err instanceof Error ? err.message : String(err);
      console.error("[cron/metering-cerrar-mes] No se pudo cerrar", periodo, detalle);
      fallados.push({ periodo, error: detalle });
    }
  }

  const payload = { pendientes, cerrados, fallados };
  console.log("[cron/metering-cerrar-mes]", JSON.stringify(payload));

  // 500 a propósito: lo que no se pudo cerrar se reintenta mañana, pero el mail
  // sale hoy con el mes y el motivo adentro. Un "no pude" en 200 es invisible.
  return NextResponse.json(payload, { status: fallados.length > 0 ? 500 : 200 });
}

export const GET = withCron("metering-cerrar-mes", handler);
