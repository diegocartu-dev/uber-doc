import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { avisarCorreoEntrante } from "@/lib/correo";

// ─── Webhook de Resend Inbound (email.received) ──────────────────────────────
// Recibe lo que llega a contacto@docto.com.ar y lo guarda en `correos`.
// Auth simple por query param ?clave= contra CORREO_WEBHOOK_CLAVE.
// El payload trae solo metadatos: el cuerpo completo se pide a la API de
// Resend; si esa llamada falla, se guardan igual los metadatos (mejor mail
// sin cuerpo que mail perdido). Idempotente por índice único en resend_id.

export async function POST(req: NextRequest) {
  const claveEsperada = process.env.CORREO_WEBHOOK_CLAVE;
  if (!claveEsperada || req.nextUrl.searchParams.get("clave") !== claveEsperada) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  let body: { type?: string; data?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  if (body.type !== "email.received") {
    return NextResponse.json({ ok: true, ignorado: body.type ?? "sin type" });
  }

  const data = body.data ?? {};
  const emailId = (data.email_id ?? data.id) as string | undefined;
  if (!emailId) {
    return NextResponse.json({ error: "Sin email_id" }, { status: 400 });
  }

  // Metadatos del payload (fallback si la API no responde).
  const deMeta = Array.isArray(data.from) ? String(data.from[0]) : String(data.from ?? "");
  const paraMeta = Array.isArray(data.to) ? (data.to as string[]).join(", ") : String(data.to ?? "");
  let de = deMeta;
  let para = paraMeta;
  let asunto = String(data.subject ?? "");
  let cuerpoTexto: string | null = null;
  let cuerpoHtml: string | null = null;
  let adjuntos: unknown = data.attachments ?? null;

  try {
    const res = await fetch(`https://api.resend.com/emails/receiving/${emailId}`, {
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) {
      const completo = (await res.json()) as Record<string, unknown>;
      de = String(completo.from ?? de);
      para = Array.isArray(completo.to) ? (completo.to as string[]).join(", ") : String(completo.to ?? para);
      asunto = String(completo.subject ?? asunto);
      cuerpoTexto = (completo.text as string | null) ?? null;
      cuerpoHtml = (completo.html as string | null) ?? null;
      adjuntos = completo.attachments ?? adjuntos;
    } else {
      console.error("[correo] API de Resend respondió", res.status, "para", emailId);
    }
  } catch (err) {
    console.error("[correo] no se pudo pedir el cuerpo completo:", err);
  }

  // Correos "de sistema" (pedido Diego 03/08: LinkedIn ensuciaba la Bandeja):
  // notificaciones automáticas de plataformas. Quedan guardados (sirven para
  // códigos de verificación) pero archivados: sin chip SIN ATENDER y sin aviso
  // por mail a Diego. Un remitente real jamás matchea estos patrones.
  const esSistema =
    /(^|[.-])(no-?reply|noreply|notifications?|updates?|newsletters?|marketing|mailer|bounce|do-?not-?reply)@/i.test(de) ||
    /@(linkedin\.com|facebookmail\.com|instagram\.com|twitter\.com|x\.com|tiktok\.com|pinterest\.com|accounts\.google\.com|amazonses\.com)$/i.test(de.trim());

  const admin = createAdminClient();
  const { data: fila, error } = await admin
    .from("correos")
    .insert({
      direccion: "entrada",
      de,
      para,
      asunto,
      cuerpo_texto: cuerpoTexto,
      cuerpo_html: cuerpoHtml,
      adjuntos,
      resend_id: emailId,
      sistema: esSistema,
      atendido: esSistema,
    })
    .select("id")
    .single();

  if (error) {
    // Duplicado (reintento del webhook) → 200 silencioso; otro error → 500 para reintento.
    if (error.code === "23505") return NextResponse.json({ ok: true, duplicado: true });
    console.error("[correo] error guardando entrante:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!esSistema) await avisarCorreoEntrante(fila.id, de, asunto);
  return NextResponse.json({ ok: true, id: fila.id, sistema: esSistema });
}
