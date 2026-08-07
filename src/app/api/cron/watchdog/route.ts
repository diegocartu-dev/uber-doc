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

/**
 * ¿El último deploy de PRODUCCIÓN falló? Consulta la API de Vercel.
 *
 * Un build fallido es invisible hoy: el sitio sigue respondiendo (con la
 * versión vieja), el monitor de uptime lo ve sano y nadie se entera de que lo
 * que se mergeó NO está en la calle. Pasó el 06/08: la caída de Supabase colgó
 * la compilación, el deploy quedó en Error y producción sirvió durante 3 horas
 * un build sin el cron de liberar reservas — descubierto de casualidad.
 *
 * Best-effort: si faltan credenciales o la API no responde, devuelve null y el
 * watchdog sigue con lo suyo. Nunca rompe el cron.
 */
async function ultimoDeployProdFallido(): Promise<{ creado: string; url: string } | null> {
  const token = process.env.VERCEL_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;
  const teamId = process.env.VERCEL_TEAM_ID;
  if (!token || !projectId) return null;
  try {
    const qs = new URLSearchParams({ projectId, target: "production", limit: "3" });
    if (teamId) qs.set("teamId", teamId);
    const res = await fetch(`https://api.vercel.com/v6/deployments?${qs}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { deployments?: { state?: string; url?: string; created?: number }[] };
    const ultimo = (data.deployments ?? [])[0];
    if (!ultimo || ultimo.state !== "ERROR") return null;
    return { creado: new Date(ultimo.created ?? Date.now()).toISOString(), url: ultimo.url ?? "(sin url)" };
  } catch {
    return null;
  }
}

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

  // Dejar registrado QUÉ VERSIÓN está viva en producción. Sin esto, saber si lo
  // que se mergeó está realmente en la calle exige revisar Vercel a mano — que
  // fue justo lo que faltó el 06/08.
  try {
    await admin.from("cron_runs").upsert({
      cron_key: "version-viva",
      last_run_at: nowIso,
      last_status: (process.env.VERCEL_GIT_COMMIT_SHA ?? "desconocido").slice(0, 12),
      updated_at: nowIso,
    });
  } catch {
    // informativo, jamás rompe el watchdog
  }

  // Deploy de producción fallido → avisar (con el mismo anti-spam de 6 h que
  // usan los crons caídos, guardado bajo una key propia en cron_runs).
  let deployFallido: { creado: string; url: string } | null = null;
  try {
    deployFallido = await ultimoDeployProdFallido();
    if (deployFallido) {
      const previo = porKey.get("deploy-prod");
      const yaAvisado =
        previo?.last_alerted_at && ahora - Date.parse(previo.last_alerted_at) < ANTI_SPAM_MS;
      if (!yaAvisado) {
        await admin.from("cron_runs").upsert({
          cron_key: "deploy-prod",
          last_run_at: nowIso,
          last_status: "deploy_fallido",
          last_alerted_at: nowIso,
          updated_at: nowIso,
        });
        await sendDoctoAlert(
          "🔴 El último deploy a producción FALLÓ",
          [
            "El último intento de publicar cambios en producción terminó en error.",
            "",
            "Qué significa: docto.com.ar SIGUE ANDANDO, pero con la versión anterior.",
            "Todo lo que se aprobó después de ese deploy NO está en la calle, aunque",
            "figure como terminado.",
            "",
            `Cuándo falló: ${deployFallido.creado}`,
            `Deploy: https://${deployFallido.url}`,
            "",
            "¿Tenés que hacer algo? Sí: abrí Claude Code y decime",
            '"el deploy de producción falló, revisalo y volvé a publicar".',
            "",
            "Causa más común: la compilación se cuelga si la base está caída en ese",
            "momento. Suele resolverse republicando cuando la base volvió.",
          ].join("\n")
        );
      }
    }
  } catch {
    // El chequeo de deploy jamás debe voltear el watchdog.
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
