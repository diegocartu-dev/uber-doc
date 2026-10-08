import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";

let vapidConfigured = false;

/**
 * Las claves vienen de variables de Vercel, que pueden traer un salto de línea
 * pegado al final (real o escrito como "\n"). El navegador lo tolera; web-push no
 * ("Vapid public key must be a URL safe Base 64") y el error no lo atajaba nadie:
 * ningún push del servidor salía, y el aviso de 15 minutos antes del turno cortaba
 * la tarea entera, WhatsApp incluido (08/10/2026).
 */
export function limpiarClaveVapid(clave: string | undefined): string {
  return (clave ?? "").replace(/\\n/g, "").trim();
}

function ensureVapid() {
  if (vapidConfigured) return true;
  const pub = limpiarClaveVapid(process.env.VAPID_PUBLIC_KEY);
  const priv = limpiarClaveVapid(process.env.VAPID_PRIVATE_KEY);
  if (!pub || !priv) return false;
  try {
    webpush.setVapidDetails("mailto:soporte@docto.com.ar", pub, priv);
  } catch (e) {
    // Una clave rota no puede tirar abajo lo que viene después (el WhatsApp).
    // Avisa al equipo una vez por día: los push están todos caídos.
    const motivo = e instanceof Error ? e.message : String(e);
    console.error("[push] clave VAPID inválida:", motivo);
    void import("@/lib/alertas").then(({ sendDoctoAlertThrottled }) =>
      sendDoctoAlertThrottled(
        "push-vapid-invalida",
        24,
        "🔴 Las notificaciones push a los profesionales están caídas",
        `La clave de las notificaciones push (VAPID) es inválida: ${motivo}\n\nNingún push sale hasta corregirla. Los WhatsApp siguen saliendo.\n\n¿Tenés que hacer algo? Sí: abrí Claude Code y decime "investigá la clave VAPID".`
      )
    );
    return false;
  }
  vapidConfigured = true;
  return true;
}

type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  silent?: boolean;
};

export async function enviarPush(userId: string, payload: PushPayload): Promise<boolean> {
  // Feature flag: web push
  try {
    const { getFlag } = await import("@/lib/feature-flags");
    if (!(await getFlag("web_push"))) {
      console.log("[push] skipped por flag web_push apagado:", payload.title);
      return false;
    }
  } catch { /* si falla el flag check, continuar con el envio */ }

  if (!ensureVapid()) return false;

  const supabase = createAdminClient();
  // TODAS las suscripciones activas del usuario — celular Y compu. Antes se
  // enviaba solo a la más reciente (limit 1): si el médico activaba push en la
  // compu después que en el celular, el celular quedaba MUDO para siempre.
  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("user_id", userId)
    .eq("activa", true)
    .order("created_at", { ascending: false });

  if (!subs || subs.length === 0) return false;

  const resultados = await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload)
        );
        return true;
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number })?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          // Suscripción muerta (dispositivo la revocó/expiró) → desactivar
          await supabase
            .from("push_subscriptions")
            .update({ activa: false })
            .eq("endpoint", sub.endpoint);
        }
        return false;
      }
    })
  );

  // true si llegó al menos a un dispositivo
  return resultados.some(Boolean);
}

export async function medicoEstaEnCurso(medicoId: string): Promise<boolean> {
  const supabase = createAdminClient();

  const { data: consultaEC } = await supabase
    .from("consultas")
    .select("id")
    .eq("medico_id", medicoId)
    .eq("estado", "en_curso")
    .limit(1)
    .maybeSingle();
  if (consultaEC) return true;

  const { data: turnoEC } = await supabase
    .from("turnos")
    .select("id")
    .eq("medico_id", medicoId)
    .eq("estado", "en_curso")
    .limit(1)
    .maybeSingle();
  return !!turnoEC;
}

export async function pushAlMedico(
  medicoId: string,
  payload: PushPayload,
  verificarEnCurso = false
): Promise<boolean> {
  if (verificarEnCurso) {
    const enCurso = await medicoEstaEnCurso(medicoId);
    if (enCurso) return false;
  }

  const supabase = createAdminClient();
  const { data: medico } = await supabase
    .from("medicos")
    .select("user_id")
    .eq("id", medicoId)
    .single();

  if (!medico) return false;
  return enviarPush(medico.user_id, payload);
}

export async function pushAlPaciente(
  pacienteId: string,
  payload: PushPayload
): Promise<boolean> {
  const supabase = createAdminClient();
  const { data: paciente } = await supabase
    .from("pacientes")
    .select("user_id")
    .eq("id", pacienteId)
    .single();

  if (!paciente) return false;
  return enviarPush(paciente.user_id, payload);
}
