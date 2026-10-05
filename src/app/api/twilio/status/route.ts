// StatusCallback de Twilio: el estado REAL de entrega de cada WhatsApp
// (queued → sent → delivered/read, o failed/undelivered). Cierra el hallazgo
// del 27/08: "un aviso enviado no es un aviso recibido" — hasta ahora la base
// solo sabía que Twilio aceptó la llamada.
//
// Twilio pega acá (POST form-encoded) por cada transición del mensaje. La URL
// la fija WHATSAPP_STATUS_CALLBACK_URL (apuntando a WWW: los webhooks al apex
// se pierden en el 307 — regla de la casa) y se manda por mensaje en el
// momento del envío (lib/whatsapp.ts).
//
// La autenticidad se verifica con la firma X-Twilio-Signature (HMAC-SHA1 de
// URL + parámetros ordenados, clave = auth token). Sin firma válida, 403: este
// endpoint escribe en la base y no puede aceptar POSTs anónimos.

import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendDoctoAlert } from "@/lib/alertas";
import { waitUntil } from "@vercel/functions";

// Un aviso que NO llegó al profesional mientras un paciente espera es una
// atención que se pierde en silencio (05/10/2026: un pedido murió a los 51 s
// con el WhatsApp al profesional en "undelivered" y nadie se enteró). Twilio
// manda estos dos estados como finales.
const NO_LLEGO = new Set(["undelivered", "failed"]);

function firmaValida(url: string, params: Record<string, string>, firma: string | null): boolean {
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!token || !firma) return false;
  // Spec de Twilio: URL exacta + cada par clave+valor con las claves ordenadas.
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join("");
  const esperada = createHmac("sha1", token).update(Buffer.from(data, "utf-8")).digest("base64");
  const a = Buffer.from(esperada);
  const b = Buffer.from(firma);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  const urlConfigurada = process.env.WHATSAPP_STATUS_CALLBACK_URL;
  if (!urlConfigurada) return NextResponse.json({ error: "No configurado" }, { status: 404 });

  const form = await req.formData();
  const params: Record<string, string> = {};
  form.forEach((v, k) => { params[k] = String(v); });

  // La firma se computa sobre la URL que Twilio CREYÓ pegar: la configurada,
  // no la que ve Next detrás del proxy de Vercel (host/proto pueden diferir).
  if (!firmaValida(urlConfigurada, params, req.headers.get("x-twilio-signature"))) {
    return NextResponse.json({ error: "Firma inválida" }, { status: 403 });
  }

  const sid = params.MessageSid ?? params.SmsSid;
  const status = params.MessageStatus ?? params.SmsStatus;
  if (!sid || !status) return NextResponse.json({ ok: true });

  const admin = createAdminClient();
  const { data: envios } = await admin
    .from("whatsapp_envios")
    .update({
      twilio_status: status,
      twilio_status_at: new Date().toISOString(),
      twilio_status_error: params.ErrorCode ?? null,
    })
    .eq("twilio_sid", sid)
    .select("medico_id, plantilla, consulta_id, turno_id");

  const envio = envios?.[0];
  if (envio?.medico_id && NO_LLEGO.has(status)) {
    waitUntil(avisarAlEquipoQueNoLlego(envio, status, params.ErrorCode ?? null));
  }

  return NextResponse.json({ ok: true });
}

/**
 * Alerta al equipo con lo que necesita para actuar YA: qué profesional, qué
 * aviso y por qué (código de Twilio). Sin nombres en el asunto: el mail viaja
 * por fuera. Nunca lanza.
 */
async function avisarAlEquipoQueNoLlego(
  envio: { medico_id: string | null; plantilla: string; consulta_id: string | null; turno_id: string | null },
  status: string,
  errorCode: string | null
): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data: medico } = await admin
      .from("medicos")
      .select("nombre_completo, disponible")
      .eq("id", envio.medico_id as string)
      .maybeSingle();
    const quien = medico?.nombre_completo ?? "un profesional";
    const urgente = envio.plantilla === "aceptar_paciente" || envio.plantilla === "paciente_esperando";
    await sendDoctoAlert(
      `${urgente ? "🔴" : "🟠"} WhatsApp a ${quien} NO llegó (${status})`,
      `El aviso "${envio.plantilla}" a ${quien} volvió como "${status}"${errorCode ? ` (código Twilio ${errorCode})` : ""}.\n\n` +
        (urgente
          ? "Hay un paciente esperando y el profesional no se enteró por WhatsApp. Si figura disponible, conviene llamarlo o apagarlo desde el panel: mientras siga publicado, lo siguen eligiendo.\n\n"
          : "No es un paciente esperando ahora, pero este profesional no recibe nuestros WhatsApp: revisá su celular en la ficha.\n\n") +
        `Disponible ahora: ${medico?.disponible ? "sí" : "no"}.\n\n———\nDetalle técnico (para Claude): medico_id=${envio.medico_id}, consulta_id=${envio.consulta_id ?? "-"}, turno_id=${envio.turno_id ?? "-"}, plantilla=${envio.plantilla}, status=${status}, error=${errorCode ?? "-"}.`
    );
  } catch (e) {
    console.error("[twilio/status] no se pudo alertar al equipo:", e instanceof Error ? e.message : e);
  }
}
