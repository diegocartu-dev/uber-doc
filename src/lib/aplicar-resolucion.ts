// src/lib/aplicar-resolucion.ts
//
// Aplicador de la resolución de consultas CI (Fase 2). Toca DB + Mercado Pago.
// Es el ÚNICO punto que decide "¿está para resolver?" y aplica el resultado:
// computa señales objetivas de presencia, las pasa por el motor puro
// (resolucion-consultas.ts) y, si corresponde, ejecuta la acción de plata
// (ejecutarRefund) + el estado terminal + el registro de ausencia.
//
// Lo invocan TODOS los caminos, y cada uno solo "consulta": el chequeo on-demand
// de /api/consulta-estado (resolución en tiempo real mientras el paciente pollea)
// y los crons de backstop (rejoin-expirar, tolerancia-inicio). La ventana de
// gracia se hace cumplir ACÁ, así ningún caller la duplica ni la contradice.
//
// Idempotente: el UPDATE final va guardado por estado='en_curso'. ejecutarRefund
// dedupe por idempotencyPrefix (MP key) → llamadas concurrentes no duplican plata.
//
// Fuente: docs/diseno-resolucion-consultas.md §6.4/§7 · DECISIONES_PRODUCTO_DOCTO.md §13.

import { createAdminClient } from "@/lib/supabase/admin";
import { ejecutarRefund } from "@/lib/cancelaciones";
import { resolver } from "@/lib/resolucion-consultas";
import { logInfo, logError } from "@/lib/logger";

type Admin = ReturnType<typeof createAdminClient>;

export type ResueltaPor =
  | "polling_consulta"
  | "cron_rejoin"
  | "cron_tolerancia"
  | "cron_huerfanas";

// Ventana de reconexión tras un corte de red (ambos estuvieron, se cortó).
const REJOIN_GRACIA_MS = 2 * 60 * 1000;
// Tolerancia para que el médico se presente antes de declararlo ausente y
// reembolsar (decisión Diego 19/06/2026). Corre desde en_curso_at (pago aprobado).
const TOLERANCIA_MEDICO_MS = 15 * 60 * 1000;

/** ¿Algún participante con ese rol llegó a conectarse al video del recurso? */
async function entroAlVideo(
  admin: Admin,
  tipo: "consulta" | "turno",
  recursoId: string,
  rol: "medico" | "paciente"
): Promise<boolean> {
  const { count } = await admin
    .from("video_presencia")
    .select("id", { count: "exact", head: true })
    .eq("tipo", tipo)
    .eq("recurso_id", recursoId)
    .eq("rol", rol)
    .eq("evento", "joined");
  return (count ?? 0) > 0;
}

/**
 * Resuelve una consulta CI `en_curso` si — y solo si — ya corresponde:
 *  - hubo un corte (`desconectado_at`) y pasó la ventana de rejoin (2 min), o
 *  - no hubo corte, el médico nunca entró al video y pasó la tolerancia (15 min).
 *
 * En cualquier otro caso (llamada activa, dentro de la gracia, o consulta atendida
 * sin corte) devuelve null SIN tocar nada — nunca fuerza el cierre de una consulta
 * que podría estar en curso. Devuelve el motivo terminal aplicado, o null.
 */
export async function resolverYAplicarConsulta(
  consultaId: string,
  resueltaPor: ResueltaPor
): Promise<string | null> {
  const admin = createAdminClient();

  const { data: c } = await admin
    .from("consultas")
    .select(
      "id, estado, medico_id, pago_id, mp_net_amount_medico, mp_application_fee, en_curso_at, desconectado_at"
    )
    .eq("id", consultaId)
    .eq("estado", "en_curso")
    .maybeSingle();
  if (!c) return null; // ya resuelta, no en_curso, o no existe

  const ahora = Date.now();
  const corteMs = c.desconectado_at ? new Date(c.desconectado_at).getTime() : null;
  const inicioMs = c.en_curso_at ? new Date(c.en_curso_at).getTime() : null;

  // Pre-chequeo barato de timing: si no podría estar para resolver, ni consultamos
  // presencia (esto corre en cada poll de 5s del paciente).
  const venceRejoin = corteMs != null && ahora - corteMs >= REJOIN_GRACIA_MS;
  const podriaSerAusente =
    corteMs == null && inicioMs != null && ahora - inicioMs >= TOLERANCIA_MEDICO_MS;
  if (!venceRejoin && !podriaSerAusente) return null;

  const [medicoEntroAlVideo, pacienteEntroAlVideo] = await Promise.all([
    entroAlVideo(admin, "consulta", consultaId, "medico"),
    entroAlVideo(admin, "consulta", consultaId, "paciente"),
  ]);

  // Si el médico SÍ entró y no hubo corte, es una consulta atendida o todavía
  // activa → NO la resolvemos por este camino (no force-complete). El cierre
  // normal lo hace room_finished; el de huérfanas atendidas, cerrar-huerfanas.
  if (podriaSerAusente && medicoEntroAlVideo) return null;

  const r = resolver({
    // CI: el paciente pagó y entró a la sala → presente por definición.
    pacienteSePresento: true,
    medicoEntroAlVideo,
    pacienteEntroAlVideo,
    presenciaConfiable: true,
    huboCorte: corteMs != null,
  });

  // Defensa: el motor solo devuelve completada si ambos estuvieron sin corte; no
  // forzamos cierre por este camino (podría ser una consulta en curso).
  if (r.motivo === "completada") return null;

  // Acción de plata ANTES del estado terminal (mismo patrón que cancelaciones):
  // ejecutarRefund es idempotente (MP key); si el proceso muere antes del UPDATE,
  // la consulta sigue en_curso y el próximo tick la re-resuelve sin doble cobro.
  let reintegroEstado: string | null = null;
  if (
    r.accionPlata === "refund" &&
    c.pago_id &&
    c.mp_net_amount_medico &&
    c.mp_application_fee
  ) {
    reintegroEstado = await ejecutarRefund(
      consultaId,
      c.medico_id,
      c.pago_id,
      c.mp_net_amount_medico,
      c.mp_application_fee,
      "consulta"
    );
  }

  // UPDATE terminal idempotente: solo si sigue en_curso (anti doble-resolución).
  const { data: aplicada } = await admin
    .from("consultas")
    .update({
      estado: r.motivo,
      resolucion_motivo: r.motivo,
      resuelta_at: new Date().toISOString(),
      resuelta_por: resueltaPor,
      reintegro_estado: reintegroEstado,
      desconectado_at: null,
    })
    .eq("id", consultaId)
    .eq("estado", "en_curso")
    .select("id")
    .maybeSingle();

  if (!aplicada) return null; // otro proceso la resolvió primero

  if (r.registrarAusenciaMedico) {
    const { error } = await admin.from("ausencias_medico").insert({
      medico_id: c.medico_id,
      tipo: "consulta",
      recurso_id: consultaId,
      motivo: "medico_ausente",
    });
    if (error) {
      logError("[RESOLUCION]", "Error registrando ausencia del médico", {
        consultaId,
        error: error.message,
      });
    }
  }

  logInfo("[RESOLUCION]", "Consulta resuelta", {
    consultaId,
    motivo: r.motivo,
    accionPlata: r.accionPlata,
    reintegroEstado,
    resueltaPor,
  });
  return r.motivo;
}
