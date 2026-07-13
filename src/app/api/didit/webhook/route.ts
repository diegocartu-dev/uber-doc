import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verificarFirmaWebhook, timestampEsValido } from "@/lib/didit/client";
import { reconciliarIdentidad, type MedicoIdentidad } from "@/lib/didit/reconciliar";
import type { DiditWebhookPayload } from "@/lib/didit/types";

// El cruce contra REFEPS (validarMedicoREFEPS) puede reintentar ante timeout del Bus.
// Sin esto, el default de Vercel (~15s) mataría el webhook a mitad del cruce.
export const maxDuration = 60;

// POST /api/didit/webhook
// Didit notifica cuando cambia el estado de una sesión.
// SEGURIDAD: no confiamos en el payload. Verificamos firma + RE-CONSULTAMOS la
// decisión autoritativa a la API de Didit con nuestra API key. Solo marcamos
// identidad_validada si Didit aprobó Y la matrícula declarada pertenece al DNI
// que Didit verificó biométricamente (cruce contra REFEPS). Esa lógica vive en
// `reconciliarIdentidad` (compartida con el cron de reconciliación — única fuente
// de verdad del control anti-suplantación).
export async function POST(req: NextRequest) {
  // 1. Raw body — necesario para verificar la firma (no re-serializar).
  const rawBody = await req.text();

  const secret = process.env.DIDIT_WEBHOOK_SECRET?.trim();
  const sig =
    req.headers.get("x-signature-v2") ??
    req.headers.get("x-signature") ??
    req.headers.get("x-didit-signature");
  const ts = req.headers.get("x-timestamp");

  // Anti-replay
  if (!timestampEsValido(ts)) {
    return NextResponse.json({ error: "timestamp" }, { status: 401 });
  }

  // Verificación de firma (si hay secret). El re-fetch de la decisión nos
  // protege aunque la firma no se pueda verificar, pero la exigimos cuando
  // el secret está configurado.
  if (secret) {
    if (!verificarFirmaWebhook(rawBody, sig, secret)) {
      // Log de NOMBRES de headers (no valores) para confirmar el esquema en la
      // primera entrega real. NUNCA logueamos el payload (puede traer biometría).
      console.warn(
        "[didit/webhook] firma inválida — headers presentes:",
        [...req.headers.keys()].join(", ")
      );
      return NextResponse.json({ error: "firma" }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    // C1 (Roberto): fallar CERRADO en producción. Sin secret no hay primera
    // línea de defensa; un secret olvidado en Vercel no puede degradar el
    // webhook en silencio. En dev/preview se tolera para poder iterar.
    console.error(
      "[didit/webhook] DIDIT_WEBHOOK_SECRET ausente en producción — rechazando webhook"
    );
    return NextResponse.json({ error: "config" }, { status: 500 });
  } else {
    console.warn(
      "[didit/webhook] DIDIT_WEBHOOK_SECRET no configurado (dev) — se omite verificación de firma"
    );
  }

  // 2. Parsear payload (solo para session_id + vendor_data; el resto se re-fetch).
  let payload: DiditWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "json" }, { status: 400 });
  }

  const sessionId = payload.session_id;
  const medicoId = payload.vendor_data;
  if (!sessionId) {
    return NextResponse.json({ ok: true });
  }

  const admin = createAdminClient();

  // 3. Resolver médico por vendor_data (medico_id) o por didit_session_id.
  let medico: MedicoIdentidad | null = null;
  if (medicoId) {
    const { data } = await admin
      .from("medicos")
      .select("id, dni, numero_matricula, identidad_validada")
      .eq("id", medicoId)
      .maybeSingle();
    medico = data;
  }
  if (!medico) {
    const { data } = await admin
      .from("medicos")
      .select("id, dni, numero_matricula, identidad_validada")
      .eq("didit_session_id", sessionId)
      .maybeSingle();
    medico = data;
  }
  if (!medico) {
    console.warn("[didit/webhook] médico no encontrado para sesión", sessionId);
    return NextResponse.json({ ok: true });
  }

  // 4. Decisión autoritativa + cruce anti-suplantación + persistencia (compartido).
  const resultado = await reconciliarIdentidad(admin, medico, sessionId);

  if (resultado.outcome === "error_decision") {
    // No pudimos consultar la decisión → 502 para que Didit reintente.
    console.error(
      "[didit/webhook] no se pudo obtener la decisión:",
      resultado.error
    );
    return NextResponse.json({ error: "decision" }, { status: 502 });
  }
  if (resultado.outcome === "en_revision") {
    console.warn(
      `[didit/webhook] aprobado por Didit pero el cruce no cierra (${resultado.motivo}) medico=${medico.id}`
    );
  }
  if (resultado.outcome === "refeps_transitorio") {
    // REFEPS no respondió → no decidimos; el cron de reconciliación reintenta.
    console.warn(
      `[didit/webhook] REFEPS transitorio; se reintentará por el cron; medico=${medico.id}`
    );
  }

  return NextResponse.json({ ok: true });
}
