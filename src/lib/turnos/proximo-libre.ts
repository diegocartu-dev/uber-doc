// El próximo turno libre de cada profesional en la clínica virtual (13/10/2026).
//
// La clínica y el menú de rescate pedían los primeros 500 turnos libres de
// TODOS, ordenados por fecha. Con las agendas de hoy eso alcanza apenas para
// mañana, y un profesional con la consulta inmediata apagada y turnos recién
// desde pasado mañana quedaba fuera de la clínica sin que nadie se enterara.
// Lo que esas pantallas usan es, por profesional, si tiene turnos y cuál es el
// más cercano: una fila por profesional (función de la base, sin tope).
//
// Si la función falla, se vuelve al SELECT de antes: la clínica nunca se queda
// sin turnos por esto.

import type { SupabaseClient } from "@supabase/supabase-js";

export type TurnoLibre = { medico_id: string; fecha: string; hora_inicio: string };

const TOPE_DE_RESPALDO = 500;

/** Ordenados por fecha y hora, como los devolvía el SELECT de antes. */
export async function proximoTurnoLibrePorMedico(cliente: SupabaseClient, desde: string): Promise<TurnoLibre[]> {
  const { data, error } = await cliente.rpc("proximo_turno_libre_por_medico", { p_desde: desde });
  if (!error && Array.isArray(data)) {
    return (data as TurnoLibre[])
      .filter((t) => t.medico_id && t.fecha && t.hora_inicio)
      .sort((a, b) => (a.fecha !== b.fecha ? (a.fecha < b.fecha ? -1 : 1) : a.hora_inicio < b.hora_inicio ? -1 : a.hora_inicio > b.hora_inicio ? 1 : 0));
  }
  console.error("[proximo-turno-libre] la función falló, uso el SELECT con tope:", error?.message);
  const { data: respaldo } = await cliente
    .from("turnos")
    .select("medico_id, fecha, hora_inicio")
    .eq("estado", "disponible")
    .eq("canal_origen", "clinica_virtual")
    .gte("fecha", desde)
    .order("fecha", { ascending: true })
    .order("hora_inicio", { ascending: true })
    .limit(TOPE_DE_RESPALDO);
  return (respaldo ?? []) as TurnoLibre[];
}
