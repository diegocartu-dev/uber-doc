import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enviarAvisoAgendaVencida } from "@/lib/email";
import { withCron } from "@/lib/cron-guard";

/**
 * Aviso de agenda vencida — decisión Diego 17/07 (contracara del límite de 60
 * días): el día en que vence su agenda, el médico recibe UNA invitación a
 * renovarla, SOLO si no tiene otras agendas activas a futuro (si tiene
 * cobertura, no se lo molesta). Un mail por médico por vencimiento.
 *
 * Diseño:
 * - Corre diario 12:00 UTC (09:00 ART). Ventana [hoy-2, hoy]: si el envío de un
 *   día falla (Resend caído, etc.), el reintento de mañana lo cubre — el candado
 *   `aviso_vencimiento_enviado_at` garantiza el "una sola vez".
 * - "Sin cobertura futura" = ninguna agenda activo=true con fecha_fin > hoy.
 * - Cuentas test excluidas. Las agendas de médicos CON cobertura se marcan
 *   procesadas igual (el aviso "no correspondía" y no debe re-evaluarse).
 * - Todo por service role (tabla y columna sin exposición a authenticated).
 */

function hoyAR(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "America/Argentina/Buenos_Aires" });
}

function diasAtras(iso: string, dias: number): string {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() - dias);
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}-${d.getDate().toString().padStart(2, "0")}`;
}

async function handler() {
  const admin = createAdminClient();
  const hoy = hoyAR();
  const inicioVentana = diasAtras(hoy, 2);

  // Agendas activas que vencen hoy (ventana de reintento de 2 días) sin aviso procesado
  const { data: vencen, error } = await admin
    .from("agenda_modelos")
    .select("id, medico_id, fecha_fin")
    .eq("activo", true)
    .gte("fecha_fin", inicioVentana)
    .lte("fecha_fin", hoy)
    .is("aviso_vencimiento_enviado_at", null);

  if (error) {
    console.error("[cron/aviso-agenda-vencida] Error leyendo agendas:", error.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
  if (!vencen || vencen.length === 0) {
    return NextResponse.json({ ok: true, avisos: 0 });
  }

  const medicoIds = [...new Set(vencen.map((v) => v.medico_id).filter(Boolean))] as string[];

  // Cobertura futura: alguna agenda activa con fecha_fin posterior a hoy
  const { data: futuras, error: errFuturas } = await admin
    .from("agenda_modelos")
    .select("medico_id")
    .in("medico_id", medicoIds)
    .eq("activo", true)
    .gt("fecha_fin", hoy);
  if (errFuturas) {
    console.error("[cron/aviso-agenda-vencida] Error leyendo cobertura:", errFuturas.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
  const conCobertura = new Set((futuras ?? []).map((f) => f.medico_id));

  const { data: medicos, error: errMedicos } = await admin
    .from("medicos")
    .select("id, nombre_completo, email, es_cuenta_test")
    .in("id", medicoIds);
  if (errMedicos) {
    console.error("[cron/aviso-agenda-vencida] Error leyendo medicos:", errMedicos.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
  const porMedico = new Map((medicos ?? []).map((m) => [m.id, m]));

  const ahoraISO = new Date().toISOString();
  let avisos = 0;
  const procesadas: string[] = [];

  for (const medicoId of medicoIds) {
    const filas = vencen.filter((v) => v.medico_id === medicoId);
    const medico = porMedico.get(medicoId);

    // Sin ficha, cuenta test, sin email, o CON cobertura futura → no se avisa,
    // pero las filas quedan procesadas (el aviso no correspondía).
    const debeAvisar =
      !!medico && !medico.es_cuenta_test && !!medico.email && !conCobertura.has(medicoId);

    if (!debeAvisar) {
      procesadas.push(...filas.map((f) => f.id));
      continue;
    }

    try {
      await enviarAvisoAgendaVencida(medico.email, medico.nombre_completo);
      avisos++;
      procesadas.push(...filas.map((f) => f.id));
    } catch (e) {
      // Envío fallido: NO se marca — la ventana de 2 días lo reintenta mañana.
      console.error(
        "[cron/aviso-agenda-vencida] Envío falló para médico",
        medicoId,
        e instanceof Error ? e.message : e
      );
    }
  }

  if (procesadas.length > 0) {
    const { error: errMark } = await admin
      .from("agenda_modelos")
      .update({ aviso_vencimiento_enviado_at: ahoraISO })
      .in("id", procesadas);
    if (errMark) {
      // Peor caso: mañana se re-evalúa dentro de la ventana; el mail duplicado
      // es preferible a nunca marcar y spamear para siempre — se alerta.
      console.error("[cron/aviso-agenda-vencida] Error marcando avisos:", errMark.message);
      return NextResponse.json({ error: "Error marcando avisos" }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, avisos, procesadas: procesadas.length });
}

export const GET = withCron("aviso-agenda-vencida", handler);
