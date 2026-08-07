import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendDoctoAlert } from "@/lib/alertas";
import { withCron } from "@/lib/cron-guard";
import { CRONS_META, duracionHumana } from "@/lib/crons-meta";

/**
 * Cron guardián ("dead man's switch"), cada 30 min: detecta crons que DEJARON de
 * correr — el fallo 100% invisible (schedule roto, deploy que saca la ruta,
 * CRON_SECRET rotado → 401 eterno, Vercel que no invoca). Ningún otro mecanismo
 * lo ve: un cron que no corre no loguea, no alerta, no existe.
 *
 * Cada cron envuelto en `withCron` registra su corrida en `cron_runs`. Acá se
 * compara el último latido contra el intervalo esperado (espejo de vercel.json);
 * si un cron lleva más de 1.5×intervalo + 30 min sin reportar → mail a Diego.
 * Anti-spam: no re-alertar el mismo cron dentro de 6 h (last_alerted_at).
 *
 * Mantener ESPERADOS en sincronía con vercel.json al agregar/sacar crons.
 */

// cron_key → intervalo esperado en minutos (según schedule en vercel.json).
const ESPERADOS: Record<string, number> = {
  "generar-slots": 1440,
  "cerrar-huerfanas": 1440,
  recordatorios: 1440,
  "limpieza-estudios-temp": 1440,
  "sala-espera-diaria": 1440,
  "reintentar-refunds": 1440,
  "rejoin-expirar": 1440,
  "repush-esperando": 10,
  "apagar-disponibilidad": 30,
  "validar-refeps-pendientes": 10,
  "resolver-turnos-vencidos": 10,
  "reconciliar-identidad": 10,
  "aviso-agenda-vencida": 1440,
  "saldo-servicios": 1440,
  "provisionar-claves": 1440,
  "liberar-reservas": 10,
  "recuperar-registros": 1440,
  "verificar-cuentas-mp": 1440,
  "documentos-sin-sello": 60,
  uptime: 1,
};

const ANTI_SPAM_MS = 6 * 60 * 60 * 1000;

export const GET = withCron("watchdog", async () => {
  const admin = createAdminClient();
  const { data: rows, error } = await admin.from("cron_runs").select("*");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const porKey = new Map((rows ?? []).map((r) => [r.cron_key as string, r]));
  const ahora = Date.now();
  const nowIso = new Date().toISOString();
  const caidos: { cron: string; sin_latido_min: number }[] = [];
  let sembrados = 0;

  for (const [key, intervaloMin] of Object.entries(ESPERADOS)) {
    const row = porKey.get(key);

    // Primera vez que el watchdog ve este cron: sembrar baseline "ahora" para
    // empezar a contar. Evita alertar por crons recién agregados o recién
    // deployados que todavía no tuvieron su primera corrida.
    if (!row?.last_run_at) {
      await admin.from("cron_runs").upsert({
        cron_key: key,
        last_run_at: nowIso,
        last_status: "esperando_primera_corrida",
        updated_at: nowIso,
      });
      sembrados++;
      continue;
    }

    const sinLatidoMs = ahora - Date.parse(row.last_run_at);
    const umbralMs = (1.5 * intervaloMin + 30) * 60_000;
    if (sinLatidoMs <= umbralMs) continue;

    // Caído. Anti-spam: solo re-alertar pasadas 6 h de la última alerta.
    const yaAlertado =
      row.last_alerted_at &&
      ahora - Date.parse(row.last_alerted_at) < ANTI_SPAM_MS;
    if (yaAlertado) continue;

    caidos.push({ cron: key, sin_latido_min: Math.round(sinLatidoMs / 60_000) });
    await admin
      .from("cron_runs")
      .update({ last_alerted_at: nowIso, updated_at: nowIso })
      .eq("cron_key", key);
  }

  if (caidos.length > 0) {
    // Mail en criollo (pedido Diego 18/07): cada alerta dice QUÉ es la tarea,
    // QUÉ impacto tiene, y si hay que HACER algo o solo esperar. La jerga va
    // al pie, en "Detalle técnico".
    const bloques = caidos.map((c) => {
      const meta = CRONS_META[c.cron];
      if (!meta) {
        return `● Tarea "${c.cron}" (sin ficha): dejó de reportar hace ${duracionHumana(c.sin_latido_min)}.\n¿Tenés que hacer algo? Sí: abrí Claude Code y decime "investigá el cron ${c.cron}".`;
      }
      const accion =
        meta.accion ??
        (meta.autoRecupera
          ? `Probablemente no: corre ${meta.cadencia} y una corrida perdida suele ser un golpe puntual (deploy u outage justo en su horario). Reintenta sola en su próximo horario y ahí te llega un mail verde "✅ Tarea recuperada". Si ese mail verde NO llega después de su próximo horario, abrí Claude Code y decime: "investigá el cron ${c.cron}".`
          : `Sí, avisá ahora: corre ${meta.cadencia}, así que ya falló varios intentos seguidos y no se va a arreglar sola. Abrí Claude Code y decime: "investigá el cron ${c.cron}".`);
      return [
        `● ${meta.nombre}`,
        `Qué hace: ${meta.queHace}.`,
        `Sin señales de vida hace ${duracionHumana(c.sin_latido_min)}.`,
        `Impacto mientras no corra: ${meta.impacto}.`,
        ``,
        `¿Tenés que hacer algo? ${accion}`,
      ].join("\n");
    });

    const asunto =
      caidos.length === 1
        ? `🔴 Tarea automática caída: ${CRONS_META[caidos[0].cron]?.nombre ?? caidos[0].cron}`
        : `🔴 ${caidos.length} tareas automáticas caídas`;

    const detalleTecnico = caidos
      .map((c) => `${c.cron}: sin latido hace ${c.sin_latido_min} min`)
      .join(" · ");

    await sendDoctoAlert(
      asunto,
      `${bloques.join("\n\n———\n\n")}\n\n———\nDetalle técnico (para Claude): ${detalleTecnico}. Posibles causas: schedule roto, ruta caída, CRON_SECRET inválido, outage en el horario de la corrida.`
    );
  }

  return NextResponse.json({ ok: true, caidos, sembrados });
});
