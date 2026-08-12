import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { withCron } from "@/lib/cron-guard";
import { esInstitucional } from "@/lib/instancia";

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
 * EL PAGO ES FUNDACIONAL (decisión Diego, 10/08/2026): sin pago, el paciente no
 * consume el turno. La retención son 15 minutos y al vencer SE LIBERA — sin
 * margen de gracia. Acá había 45 minutos extra "por si un pago de MP aprueba
 * tarde": Diego lo bajó — un pago instantáneo que se demora es una rareza que no
 * justifica tener 45 minutos de oferta invisible por CADA reserva abandonada, y
 * además desde #375 el checkout solo ofrece medios instantáneos (tarjeta, dinero
 * en cuenta, transferencia): el cupón de Rapipago que motivaba la espera ya no
 * se puede elegir.
 *
 * NUNCA le saques el turno a alguien que pagó. Dos guardas:
 *
 * 1. Ningún estado de pago VIVO: approved, pending, in_process o authorized.
 *    Estas no demoran la liberación de una reserva abandonada — solo frenan
 *    cuando MP nos AVISÓ que hay un pago en juego, y ahí no aplica "sin pago".
 * 2. Sin `pago_id`: si existe un pago asociado, hay plata en juego; que lo
 *    resuelva una persona, no este cron.
 *
 * Fecha pasada → `bloqueado`, no `disponible`: un turno de ayer no debe volver
 * a aparecer como reservable.
 */
export const maxDuration = 60;

// 0 a propósito — ver "EL PAGO ES FUNDACIONAL" arriba. Si esto vuelve a subir,
// cada reserva abandonada vuelve a ser oferta invisible por ese tiempo extra.
const GRACIA_MIN = 0;
const PAGOS_VIVOS = ["approved", "pending", "in_process", "authorized"];

export const GET = withCron("liberar-reservas", async () => {
  // Modo institucional: no aplica (Capa C) — sin pago no existe `reservado_pendiente`.
  if (esInstitucional()) {
    console.log("[liberar-reservas] modo institucional: no aplica");
    return NextResponse.json({ ok: true, mensaje: "modo institucional: no aplica" });
  }

  const admin = createAdminClient();
  const corte = new Date(Date.now() - GRACIA_MIN * 60 * 1000).toISOString();
  const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date());

  // Candidatos: vencidos hace más de la gracia, sin pago vivo y sin pago_id.
  const { data: candidatos, error: errBusca } = await admin
    .from("turnos")
    .select("id, fecha, hora_inicio, medico_id, mp_status, pago_id")
    .eq("estado", "reservado_pendiente")
    .lt("reservado_hasta", corte)
    .is("pago_id", null);
  if (errBusca) throw new Error(`buscar reservas vencidas: ${errBusca.message}`);

  const aLiberar = (candidatos ?? []).filter((t) => !PAGOS_VIVOS.includes(String(t.mp_status ?? "")));
  const futuros = aLiberar.filter((t) => String(t.fecha) >= hoy).map((t) => t.id);
  const pasados = aLiberar.filter((t) => String(t.fecha) < hoy).map((t) => t.id);

  if (futuros.length > 0) {
    const { error } = await admin
      .from("turnos")
      .update({ estado: "disponible", paciente_id: null, reservado_hasta: null })
      .in("id", futuros);
    if (error) throw new Error(`liberar futuros: ${error.message}`);
  }
  if (pasados.length > 0) {
    const { error } = await admin
      .from("turnos")
      .update({ estado: "bloqueado", paciente_id: null, reservado_hasta: null })
      .in("id", pasados);
    if (error) throw new Error(`cerrar pasados: ${error.message}`);
  }
  if (aLiberar.length > 0) {
    console.log(
      `[liberar-reservas] ${futuros.length} devueltos a disponible, ${pasados.length} cerrados por fecha pasada:`,
      aLiberar.map((t) => `${t.fecha} ${String(t.hora_inicio).slice(0, 5)}`).join(", ")
    );
  }

  return NextResponse.json({
    revisados: (candidatos ?? []).length,
    liberados: futuros.length,
    cerrados_por_fecha: pasados.length,
    detalle: aLiberar.map((t) => ({ id: t.id, fecha: t.fecha, hora: t.hora_inicio })),
  });
});
