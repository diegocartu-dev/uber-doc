import { NextResponse } from "next/server";
import { withCron } from "@/lib/cron-guard";
import { cortarSiB2C } from "@/lib/institucional/crons-institucionales";
import {
  cerrarSemana,
  semanasDeLaCorrida,
  semanasPendientesDeSellar,
  type ResumenCierreSemana,
} from "@/lib/metering/bolsa";

/**
 * Cron diario de las 04:00 ART — SELLA TODA SEMANA TERMINADA QUE SIGA ABIERTA
 * (spec §6.4).
 *
 * La semana en curso se calcula al vuelo cada vez que alguien abre el panel.
 * La semana que pasó, no: se congela acá. No es una optimización — es la
 * promesa de que el cumplimiento que la institución leyó el lunes va a decir
 * lo mismo en diciembre, aunque después alguien edite una agenda vieja o un
 * webhook llegue tarde.
 *
 * ── POR QUÉ 04:00 Y NO 00:05 ────────────────────────────────────────────────
 * Porque a las 00:05 el contador todavía no terminó de contar el domingo: un
 * encuentro se clasifica recién 15 minutos después de su cierre y el job corre
 * cada 10, así que lo que cerró el domingo 23:55 entra a `encuentros_metering`
 * a las 00:15-00:20 — DESPUÉS del sello. Esos bloques quedaban fuera del
 * cumplimiento sellado para siempre, mientras la facturación (que lee la tabla
 * en vivo) sí los cobraba.
 *
 * Y 04:00 y no 02:00 porque a las 02:00 todavía no pasó el barrido: la CI que
 * el profesional abrió el domingo a la noche y nunca cerró la termina
 * `cerrar-huerfanas` (00:00 ART, con 4 h de antigüedad mínima), y hasta que no
 * es terminal la precondición del sello la cuenta como viva y aborta. Sellar
 * antes del barrido es abortar de gusto.
 *
 * ── POR QUÉ TODOS LOS DÍAS Y NO SOLO LOS LUNES ──────────────────────────────
 * Espejo exacto del cierre mensual, por el mismo motivo y con el mismo caso
 * concreto. Corría `0 7 * * 1` y sellaba SIEMPRE la semana anterior, sin volver
 * nunca sobre la que faltó: un lunes con el clasificador atrasado —o con una
 * consulta viva del domingo que el barrido todavía no cerró— terminaba en un
 * mail rojo, y si ese mail se perdía la semana se quedaba "en curso" para
 * siempre. El watchdog no ayudaba: vigila el latido, y el cron latía.
 *
 * Encima, esta misma etapa ENDURECIÓ la precondición (las consultas inmediatas
 * se filtran por el día de su asignación, R31 bis), o sea que aborta más seguido
 * que antes. Endurecer sin dar reintento es cambiar un error silencioso por
 * otro.
 *
 * Corriendo todos los días, la semana del ejemplo se sella sola el martes: a las
 * 00:00 `cerrar-huerfanas` cierra la CI colgada, el clasificador la escribe, y a
 * las 04:00 el barrido la encuentra pendiente. Los otros seis días la corrida
 * cuesta una query y no hace nada.
 *
 * Una semana YA sellada no vuelve a la lista, aunque falte algún profesional:
 * los que entraron al padrón después del cierre no se le agregan a un
 * cumplimiento que la institución ya leyó.
 *
 * ── SI FALTA ALGO, NO SELLA: ABORTA Y AVISA ─────────────────────────────────
 * `cerrarSemana` se niega si queda un encuentro terminal de esa semana sin fila
 * en el contador, o uno todavía vivo. Esa semana queda en la lista y se
 * reintenta mañana; el 500 llega al mail de `withCron` con la semana y el motivo
 * adentro. Una semana que aborta no frena a las otras.
 *
 * Cada corrida toma como mucho dos semanas (`semanasDeLaCorrida`): las más
 * viejas primero, pero con el último lugar SIEMPRE reservado para la más
 * reciente. Sin esa reserva, dos semanas viejas trabadas se quedaban con todas
 * las corridas y la semana que la institución está por leer no se sellaba hasta
 * que la ventana de ocho las expulsara — seis semanas de atraso, con el
 * watchdog en verde.
 *
 * Idempotente: si no hay ninguna semana pendiente —el caso de seis días de cada
 * siete— no toca nada.
 *
 * SOLO instancia institucional: en el B2C corta en la primera línea.
 */

export const maxDuration = 60;

async function handler() {
  const corte = cortarSiB2C("acuerdo-cerrar-semana");
  if (corte) return corte;

  let pendientes: string[];
  try {
    pendientes = await semanasPendientesDeSellar();
  } catch (err) {
    // Una lectura fallida NO puede pasar por "no había nada que sellar": los
    // dos terminaban en un 200 y la semana perdida quedaba invisible.
    const detalle = err instanceof Error ? err.message : String(err);
    console.error("[cron/acuerdo-cerrar-semana] No se pudo leer qué semanas faltan:", detalle);
    return NextResponse.json({ error: detalle }, { status: 500 });
  }

  // Las más viejas primero, pero con el último lugar reservado para la más
  // reciente: una semana vieja trabada no puede quedarse con toda la corrida
  // y dejar sin sellar la que la institución está por leer. Ver
  // `semanasDeLaCorrida`.
  const aCerrar = semanasDeLaCorrida(pendientes);
  const cerradas: ResumenCierreSemana[] = [];
  const fallidas: { semana_ar: string; error: string }[] = [];

  for (const semana of aCerrar) {
    try {
      const resumen = await cerrarSemana(semana);
      cerradas.push(resumen);
    } catch (err) {
      // Precondición incumplida o lectura fallida. No corta el barrido: una
      // semana trabada no puede impedir que se cierre otra que sí está lista.
      const detalle = err instanceof Error ? err.message : String(err);
      console.error("[cron/acuerdo-cerrar-semana] No se pudo cerrar", semana, detalle);
      fallidas.push({ semana_ar: semana, error: detalle });
    }
  }

  const payload = { pendientes, cerradas, fallidas };
  console.log("[cron/acuerdo-cerrar-semana]", JSON.stringify(payload));

  // 500 a propósito: lo que no se pudo sellar se reintenta mañana, pero el mail
  // sale hoy con la semana y el motivo adentro. Un "no pude" en 200 es
  // invisible. `errores > 0` es el upsert que falló sin excepción.
  const hubo = fallidas.length > 0 || cerradas.some((c) => c.errores > 0);
  return NextResponse.json(payload, { status: hubo ? 500 : 200 });
}

export const GET = withCron("acuerdo-cerrar-semana", handler);
