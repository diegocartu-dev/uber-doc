import type { SupabaseClient } from "@supabase/supabase-js";

// ─── Insert de slots sin duplicar (patrón compartido) ─────────────────────────
// ÚNICA implementación del insert de slots de turnos. La usan:
//   1) el cron generar-slots (generación diaria por modelo), y
//   2) crearAgendaModelo (formulario del médico + Nova).
//
// Por qué NO upsert/onConflict: `ON CONFLICT (cols) DO NOTHING` exige un índice
// único TOTAL para inferir el árbitro; la migración 20260713 vuelve PARCIAL el
// índice `turnos_medico_fecha_hora_uq` (excluye estados terminales, para que la
// cancelación pueda re-ofrecer el horario) y el ON CONFLICT sin predicado deja de
// matchear → el upsert fallaría ENTERO y el caller seguiría como si nada (gate
// Roberto #261: crear-agenda creaba modelo+franjas con CERO turnos y éxito).
// Este patrón (select-de-activos + filtro + insert) funciona con AMBOS índices.
//
// Carrera: si otro proceso crea el mismo slot entre el select y el insert (ej. una
// cancelación re-ofreciendo el horario), el índice único rechaza el batch (23505)
// → degradación fila-por-fila ignorando duplicados. No puede duplicar: el índice
// arbitra cada fila.

// Estados que OCUPAN la clave (medico_id, fecha, hora_inicio) — espejo del
// predicado del índice único parcial (todo lo NO terminal). `reprogramado` y
// `bloqueado_sin_cobro` incluidos (gate Roberto #261): no están excluidos del
// índice, así que retienen la clave; si no figuraran acá, el filtro no los vería
// y cada corrida re-intentaría el insert (churn 23505 perpetuo).
// Si un turno reprogramado debe re-ofrecer su horario origen es una decisión de
// producto pendiente (Diego) — hoy se comporta como siempre: lo retiene.
export const ESTADOS_ACTIVOS_SLOT = [
  "disponible",
  "bloqueado",
  "reservado_pendiente",
  "confirmado",
  "en_espera",
  "en_curso",
  "reprogramado",
  "bloqueado_sin_cobro",
];

export interface SlotAInsertar {
  medico_id: string;
  modelo_id: string;
  fecha: string;
  hora_inicio: string;
  hora_fin: string;
  estado: string;
  monto: number | null;
  canal_origen?: string;
}

// PostgREST devuelve `time` como "HH:MM:SS" y los generadores también producen
// segundos; normalizamos a "HH:MM" por si algún caller pasa horas sin segundos.
function claveSlot(fecha: string, hora: string): string {
  return `${fecha}|${hora.slice(0, 5)}`;
}

export async function insertarSlotsSinDuplicar(
  supabase: SupabaseClient,
  medicoId: string,
  slots: SlotAInsertar[],
  onError: (mensaje: string, detalle: Record<string, unknown>) => void
): Promise<{ insertados: number; errorLectura?: string }> {
  if (slots.length === 0) return { insertados: 0 };

  const fechas = slots.map((s) => s.fecha).sort();
  const { data: existentes, error: errExistentes } = await supabase
    .from("turnos")
    .select("fecha, hora_inicio")
    .eq("medico_id", medicoId)
    .gte("fecha", fechas[0])
    .lte("fecha", fechas[fechas.length - 1])
    .in("estado", ESTADOS_ACTIVOS_SLOT);

  if (errExistentes) {
    // Fail-safe: sin la lista de existentes NO insertamos a ciegas.
    return { insertados: 0, errorLectura: errExistentes.message };
  }

  const ocupados = new Set(
    (existentes ?? []).map((e) => claveSlot(e.fecha, e.hora_inicio))
  );
  const nuevos = slots.filter(
    (s) => !ocupados.has(claveSlot(s.fecha, s.hora_inicio))
  );

  const BATCH = 500;
  let insertados = 0;
  for (let i = 0; i < nuevos.length; i += BATCH) {
    const batch = nuevos.slice(i, i + BATCH);
    const { data: inserted, error: errInsert } = await supabase
      .from("turnos")
      .insert(batch)
      .select("id");

    if (!errInsert) {
      insertados += inserted?.length ?? 0;
      continue;
    }
    if (errInsert.code === "23505") {
      // Carrera: reintento fila-por-fila ignorando duplicados.
      for (const fila of batch) {
        const { error: errFila } = await supabase.from("turnos").insert(fila);
        if (!errFila) insertados++;
        else if (errFila.code !== "23505") {
          onError("Error insertando slot individual", {
            fecha: fila.fecha,
            error: errFila.message,
          });
        }
      }
    } else {
      onError("Error insertando slots", { error: errInsert.message });
    }
  }

  return { insertados };
}
