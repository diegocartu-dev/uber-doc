import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { pushAlPaciente } from "@/lib/push";
import { enviarEmailRecordatorio10m } from "@/lib/email";
import { formatNombreMedico } from "@/lib/utils/texto";
import { withCron } from "@/lib/cron-guard";
import {
  minutosParaElTurno,
  tocaRecordatorio10m,
  preferenciaRecordatorio10m,
  mandarMailDeRespaldo,
  textoMinutos,
} from "@/lib/turnos/recordatorio-paciente";

// ─── Recordatorio al PACIENTE, 10 min antes del turno ────────────────────────
//
// Arreglo 12/10/2026. Este cron existía desde marzo y no le llegó a nadie:
//   1. nunca estuvo en vercel.json, así que Vercel no lo invocaba;
//   2. comparaba la hora del servidor (UTC) contra la del turno (Argentina):
//      aunque hubiera corrido, buscaba tres horas tarde;
//   3. mandaba solo push, que no llega a quien no activó las notificaciones.
// La regla (ventana, preferencias, texto) vive en lib/turnos/recordatorio-paciente.ts
// con su test. Que un cron no pueda volver a quedar sin agendar ni vigilar lo
// asegura tests/unit/crons-agendados.test.ts.
//
// UNA SOLA VEZ: la fila se marca (`recordatorio_10m_at`) ANTES de mandar, con
// la condición de que siga sin marcar: dos corridas superpuestas no lo duplican.
// Si no llegó por ningún canal, la marca se devuelve y la próxima corrida lo
// reintenta, hasta la hora del turno.

async function handler() {
  const supabase = createAdminClient();
  const ahoraMs = Date.now();

  // Hoy y mañana en hora argentina: un turno de las 00:05 se avisa el día anterior.
  const fechaAR = (ms: number) => new Date(ms - 3 * 3600_000).toISOString().slice(0, 10);
  const fechas = [fechaAR(ahoraMs), fechaAR(ahoraMs + 24 * 3600_000)];

  // Confirmado = pagado (el webhook de MP lo pasa a `confirmado`). Un paciente
  // que ya entró a la sala está en `en_espera` y no necesita el aviso.
  const { data: turnos, error } = await supabase
    .from("turnos")
    .select("id, fecha, hora_inicio, paciente_id, medico_id, recordatorios")
    .in("fecha", fechas)
    .eq("estado", "confirmado")
    .is("recordatorio_10m_at", null);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const porAvisar = (turnos ?? []).filter(
    (t) => t.paciente_id && t.hora_inicio && tocaRecordatorio10m(minutosParaElTurno(t.fecha, t.hora_inicio, ahoraMs))
  );
  if (porAvisar.length === 0) return NextResponse.json({ ok: true, enviados: 0 });

  const medicoIds = [...new Set(porAvisar.map((t) => t.medico_id).filter(Boolean))];
  // `titulo` ("Dr." / "Dra.") junto con el nombre: sin él le decíamos "Dr." a
  // casi todas las médicas.
  const { data: medicos } = await supabase
    .from("medicos").select("id, nombre_completo, titulo").in("id", medicoIds);
  const medicoMap = new Map(
    (medicos ?? []).map((m) => [m.id, formatNombreMedico(m.nombre_completo, m.titulo)])
  );

  let enviados = 0;
  let noPidio = 0;
  let sinLlegar = 0;
  for (const turno of porAvisar) {
    const pref = preferenciaRecordatorio10m(turno.recordatorios);

    const { data: tomado } = await supabase
      .from("turnos")
      .update({ recordatorio_10m_at: new Date().toISOString() })
      .eq("id", turno.id)
      .is("recordatorio_10m_at", null)
      .select("id");
    if (!tomado || tomado.length === 0) continue; // otra corrida ya lo tomó

    // Destildó "10 min" al reservar: queda marcado y no se le manda nada.
    if (!pref.quiere) {
      noPidio++;
      continue;
    }

    const minutos = minutosParaElTurno(turno.fecha, turno.hora_inicio, Date.now()) ?? 10;
    const nombreMedico = medicoMap.get(turno.medico_id);

    let pushLlego = false;
    if (pref.push) {
      // Sin nombre a mano el aviso no inventa uno ("Tu Médico" en medio de la frase).
      pushLlego = await pushAlPaciente(turno.paciente_id, {
        title: "🟡 Docto",
        body: nombreMedico
          ? `Tu consulta con ${nombreMedico} empieza en ${textoMinutos(minutos)}. Entrá a la sala.`
          : `Tu consulta empieza en ${textoMinutos(minutos)}. Entrá a la sala.`,
        url: `/turno/${turno.id}/espera`,
        tag: `recordatorio-${turno.id}`,
      }).catch(() => false);
    }

    let mailLlego = false;
    if (pref.email || mandarMailDeRespaldo(pref, pushLlego)) {
      mailLlego = await enviarEmailRecordatorio10m(turno.id);
    }

    if (pushLlego || mailLlego) {
      enviados++;
    } else {
      // No llegó por ningún lado: se devuelve la marca para reintentar.
      sinLlegar++;
      await supabase.from("turnos").update({ recordatorio_10m_at: null }).eq("id", turno.id);
    }
  }

  // Sin datos de personas: solo contadores.
  console.log("[cron/recordatorios-10min]", JSON.stringify({ enviados, noPidio, sinLlegar }));
  return NextResponse.json({ ok: true, enviados, no_pidio: noPidio, sin_llegar: sinLlegar });
}

export const GET = withCron("recordatorios-10min", handler);
