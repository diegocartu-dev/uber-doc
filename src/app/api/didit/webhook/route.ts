import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  obtenerDecisionDidit,
  verificarFirmaWebhook,
  timestampEsValido,
} from "@/lib/didit/client";
import { validarMedicoREFEPS } from "@/lib/refeps/validar";
import type { DiditWebhookPayload } from "@/lib/didit/types";

// Normaliza un número (DNI/matrícula) a solo dígitos para comparar.
function soloDigitos(v: string | null | undefined): string {
  return (v ?? "").replace(/\D/g, "");
}

// POST /api/didit/webhook
// Didit notifica cuando cambia el estado de una sesión.
// SEGURIDAD: no confiamos en el payload. Verificamos firma + RE-CONSULTAMOS la
// decisión autoritativa a la API de Didit con nuestra API key. Solo marcamos
// identidad_validada si Didit aprobó Y la matrícula declarada pertenece al DNI
// que Didit verificó biométricamente (cruce contra REFEPS).
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
  } else {
    console.warn(
      "[didit/webhook] DIDIT_WEBHOOK_SECRET no configurado — se omite verificación de firma (re-fetch protege igual)"
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

  // 3. RE-CONSULTAR la decisión autoritativa a Didit.
  let decisionStatus: string;
  let dniDidit = "";
  try {
    const decision = await obtenerDecisionDidit(sessionId);
    decisionStatus = decision.status;
    // Solo extraemos lo mínimo. NO persistimos ni logueamos liveness/face_match.
    dniDidit = soloDigitos(decision.id_verifications?.[0]?.document_number);
  } catch (e) {
    console.error(
      "[didit/webhook] no se pudo obtener la decisión:",
      e instanceof Error ? e.message : "error"
    );
    return NextResponse.json({ error: "decision" }, { status: 502 });
  }

  const admin = createAdminClient();

  // 4. Resolver médico por vendor_data (medico_id) o por didit_session_id.
  let medico: {
    id: string;
    dni: string | null;
    numero_matricula: string | null;
    identidad_validada: boolean;
  } | null = null;

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

  // Ya validado → solo actualizamos estado, no rehacemos el cruce.
  if (medico.identidad_validada) {
    await admin
      .from("medicos")
      .update({ didit_status: decisionStatus })
      .eq("id", medico.id);
    return NextResponse.json({ ok: true });
  }

  const updates: Record<string, unknown> = { didit_status: decisionStatus };

  // 5. Si Didit aprobó, hacemos el cruce anti-suplantación.
  if (decisionStatus === "Approved") {
    const dniDocto = soloDigitos(medico.dni);
    const matriculaDocto = soloDigitos(medico.numero_matricula);

    // (a) El DNI que verificó Didit debe coincidir con el DNI registrado.
    const dniCoincide = !!dniDidit && !!dniDocto && dniDidit === dniDocto;

    // (b) La matrícula declarada debe pertenecer al DNI verificado (REFEPS).
    let matriculaPertenece = false;
    if (dniDidit) {
      try {
        const refeps = await validarMedicoREFEPS(dniDidit);
        if (refeps.encontrado && refeps.matriculas?.length) {
          matriculaPertenece = refeps.matriculas.some(
            (m) => soloDigitos(m.numero) === matriculaDocto && !!matriculaDocto
          );
        }
      } catch {
        // REFEPS puede fallar puntualmente → lo tratamos como no-confirmado.
      }
    }

    if (dniCoincide && matriculaPertenece) {
      updates.identidad_validada = true;
      updates.identidad_validada_at = new Date().toISOString();
    } else {
      // Didit aprobó pero el cruce no cierra → revisión manual, NO validar.
      console.warn(
        `[didit/webhook] aprobado por Didit pero el cruce no cierra (dniCoincide=${dniCoincide}, matriculaPertenece=${matriculaPertenece}) medico=${medico.id}`
      );
      updates.didit_status = "In Review";
    }
  }

  await admin.from("medicos").update(updates).eq("id", medico.id);

  return NextResponse.json({ ok: true });
}
