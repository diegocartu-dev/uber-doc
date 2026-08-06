import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { withCron } from "@/lib/cron-guard";

/**
 * Libera las reservas de turno VENCIDAS (hallazgo 06/08/2026).
 *
 * Al reservar, el turno pasa a `reservado_pendiente` con `reservado_hasta` =
 * ahora + 15 min (retención para pagar). Si el paciente no paga, el lugar debe
 * volver a `disponible`.
 *
 * Esa liberación NUNCA funcionó. La hacía `limpiarReservasExpiradas()` desde el
 * navegador del paciente (RLS), y la policy "Pacientes actualizan sus turnos"
 * tiene `with_check (paciente_id = paciente_id_for_current_user())`: liberar
 * implica poner `paciente_id = null`, lo que viola ese check → PostgREST
 * rechaza el UPDATE y el código nunca miraba el error. Falla silenciosa clásica.
 *
 * Consecuencia real medida: 4 turnos bloqueados, el más viejo del 15/07, y DOS
 * de ellos eran turnos de HOY de una médica activa — invisibles en el calendario
 * (`page.tsx` solo lista `estado = 'disponible'`), o sea oferta perdida sin que
 * nadie se entere.
 *
 * Este cron lo hace del lado del servidor con service role, cada 10 minutos.
 *
 * Guarda dura: NUNCA liberar un turno con `mp_status = 'approved'`. Si el pago
 * entró y el webhook todavía no lo pasó a `confirmado`, liberarlo le sacaría el
 * turno a alguien que ya pagó.
 */
export const maxDuration = 60;

export const GET = withCron("liberar-reservas", async () => {
  const admin = createAdminClient();

  const { data: liberados, error } = await admin
    .from("turnos")
    .update({ estado: "disponible", paciente_id: null, reservado_hasta: null })
    .eq("estado", "reservado_pendiente")
    .lt("reservado_hasta", new Date().toISOString())
    .or("mp_status.is.null,mp_status.neq.approved")
    .select("id, fecha, hora_inicio, medico_id");

  if (error) throw new Error(`liberar reservas: ${error.message}`);

  if ((liberados ?? []).length > 0) {
    console.log(
      `[liberar-reservas] ${liberados!.length} turnos devueltos a disponible:`,
      liberados!.map((t) => `${t.fecha} ${String(t.hora_inicio).slice(0, 5)}`).join(", ")
    );
  }

  return NextResponse.json({
    liberados: (liberados ?? []).length,
    detalle: (liberados ?? []).map((t) => ({ id: t.id, fecha: t.fecha, hora: t.hora_inicio })),
  });
});
