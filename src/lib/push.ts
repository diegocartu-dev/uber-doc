import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";

let vapidConfigured = false;

function ensureVapid() {
  if (vapidConfigured) return true;
  const pub = process.env.VAPID_PUBLIC_KEY ?? "";
  const priv = process.env.VAPID_PRIVATE_KEY ?? "";
  if (!pub || !priv) return false;
  webpush.setVapidDetails("mailto:soporte@docto.com.ar", pub, priv);
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
  const { data: sub } = await supabase
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("user_id", userId)
    .eq("activa", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!sub) return false;

  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload)
    );
    return true;
  } catch (err: unknown) {
    const statusCode = (err as { statusCode?: number })?.statusCode;
    if (statusCode === 404 || statusCode === 410) {
      await supabase
        .from("push_subscriptions")
        .update({ activa: false })
        .eq("endpoint", sub.endpoint);
    }
    return false;
  }
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
