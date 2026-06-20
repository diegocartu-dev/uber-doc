// src/lib/firma/documento.ts
//
// Firma electrónica de documentos médicos genéricos (certificado / indicaciones /
// orden) — generaliza el motor de firma de receta (src/lib/firma/receta.ts) a la
// tabla `documentos`, SIN tocar el flujo de receta.
//
// Misma validez legal que la receta: firma electrónica Art. 5 Ley 25.506
// (RSA-SHA256 sobre hash determinístico), OTP one-time-use por consulta/turno,
// y registro inmutable de no-repudio en `firma_logs`. Médico validado en REFEPS
// y plataforma registrada en ReNaPDiS (gates aguas arriba).

import { createAdminClient } from "@/lib/supabase/admin";
import { hashSHA256, firmar, verificar, desencriptarClavePrivada } from "./crypto";
import { canonicalJSON } from "./receta";

// Consistente con el flujo de receta (OTP_EXPIRY_MS).
const OTP_VENTANA_MS = 5 * 60 * 1000;

type DocFirmable = {
  tipo: string;
  diagnostico: string | null;
  tratamiento: string | null;
  dias_reposo: number | null;
  contenido: string | null;
  paciente_id: string;
  medico_id: string;
};

/**
 * Objeto canónico que se hashea y firma. Liga la firma al contenido sustantivo:
 * cualquier alteración posterior de estos campos invalida la verificación.
 */
function contenidoFirmable(doc: DocFirmable) {
  return {
    tipo: doc.tipo,
    diagnostico: doc.diagnostico ?? null,
    tratamiento: doc.tratamiento ?? null,
    dias_reposo: doc.dias_reposo ?? null,
    contenido: doc.contenido ?? null,
    paciente_id: doc.paciente_id,
    medico_id: doc.medico_id,
  };
}

type FirmaResult =
  | { ok: true; hash: string; firma: string; firmado_at: string }
  | { ok: false; error: string };

export async function firmarDocumento(
  documentoId: string,
  medicoId: string,
  otpId: string,
  meta?: { ip?: string; userAgent?: string }
): Promise<FirmaResult> {
  const supabase = createAdminClient();

  // 1. OTP válido, del médico, NO consumido (ni para receta ni para documento), en ventana.
  const { data: otp } = await supabase
    .from("otp_firma")
    .select(
      "id, medico_id, usado, consulta_id, turno_id, created_at, consumido_para_receta_id, consumido_para_documento_id"
    )
    .eq("id", otpId)
    .single();

  if (!otp) return { ok: false, error: "OTP no encontrado" };
  if (!otp.usado) return { ok: false, error: "OTP no fue validado" };
  if (otp.medico_id !== medicoId) return { ok: false, error: "OTP no pertenece a este médico" };
  if (otp.consumido_para_receta_id || otp.consumido_para_documento_id) {
    return { ok: false, error: "Este código ya fue usado para firmar otro documento" };
  }
  if (Date.now() - new Date(otp.created_at).getTime() > OTP_VENTANA_MS) {
    return { ok: false, error: "OTP expirado para firma" };
  }

  // 2. Documento del médico, sin firmar, con consulta/turno asociado.
  const { data: doc } = await supabase
    .from("documentos")
    .select(
      "id, tipo, medico_id, paciente_id, diagnostico, tratamiento, dias_reposo, contenido, firma_digital, consulta_id, turno_id"
    )
    .eq("id", documentoId)
    .single();

  if (!doc) return { ok: false, error: "Documento no encontrado" };
  if (doc.medico_id !== medicoId) return { ok: false, error: "No autorizado" };
  if (doc.firma_digital) return { ok: false, error: "Documento ya firmado" };
  if (!doc.consulta_id && !doc.turno_id) {
    return { ok: false, error: "Documento sin consulta ni turno asociado" };
  }

  // 3. Scope del OTP: misma consulta/turno que el documento.
  if (doc.consulta_id && otp.consulta_id !== doc.consulta_id) {
    return { ok: false, error: "OTP no corresponde a esta consulta" };
  }
  if (doc.turno_id && otp.turno_id !== doc.turno_id) {
    return { ok: false, error: "OTP no corresponde a este turno" };
  }

  // 4. Clave activa (no revocada) del médico.
  const { data: claves } = await supabase
    .from("medico_claves")
    .select("id, clave_publica, clave_privada_enc")
    .eq("medico_id", medicoId)
    .eq("activa", true)
    .single();

  if (!claves) return { ok: false, error: "Médico sin claves de firma activas" };

  // 5. Firmar el contenido canónico.
  const contenido = canonicalJSON(contenidoFirmable(doc));
  const hash = hashSHA256(contenido);
  const clavePrivada = desencriptarClavePrivada(claves.clave_privada_enc);
  const firma = firmar(hash, clavePrivada);
  const firmadoAt = new Date().toISOString();

  const firmaDigital = {
    hash,
    firma,
    algoritmo: "RSA-SHA256",
    firmado_at: firmadoAt,
    medico_id: medicoId,
    otp_id: otpId,
  };

  // 6. Persistir firma — guard `is firma_digital null` evita doble firma (TOCTOU).
  const { data: updated, error: updateError } = await supabase
    .from("documentos")
    .update({ firma_digital: firmaDigital })
    .eq("id", documentoId)
    .eq("medico_id", medicoId)
    .is("firma_digital", null)
    .select("id");

  if (updateError || !updated || updated.length === 0) {
    return { ok: false, error: "El documento ya fue firmado o cambió de estado" };
  }

  // 7. Consumir OTP (one-time-use, atómico vía guards .is null).
  const { error: otpConsumoError } = await supabase
    .from("otp_firma")
    .update({ consumido_para_documento_id: documentoId })
    .eq("id", otpId)
    .is("consumido_para_documento_id", null)
    .is("consumido_para_receta_id", null);

  if (otpConsumoError) {
    console.error(
      "[firma-doc] OTP consumption failed (doc ya firmado vía guard is firma_digital):",
      otpConsumoError.message
    );
  }

  // 8. Registro inmutable de no-repudio.
  await supabase.from("firma_logs").insert({
    documento_id: documentoId,
    medico_id: medicoId,
    hash,
    algoritmo: "RSA-SHA256",
    firmado_at: firmadoAt,
    otp_id: otpId,
    ip: meta?.ip ?? null,
    user_agent: meta?.userAgent ?? null,
    clave_id: claves.id,
  });

  return { ok: true, hash, firma, firmado_at: firmadoAt };
}

type VerificacionResult = {
  valida: boolean;
  alterada: boolean;
  datos: {
    hash_original: string;
    hash_actual: string;
    algoritmo: string;
    firmado_at: string;
    medico_id: string;
  } | null;
};

export async function verificarFirmaDocumento(documentoId: string): Promise<VerificacionResult> {
  const supabase = createAdminClient();

  const { data: doc } = await supabase
    .from("documentos")
    .select(
      "tipo, diagnostico, tratamiento, dias_reposo, contenido, paciente_id, medico_id, firma_digital"
    )
    .eq("id", documentoId)
    .single();

  if (!doc?.firma_digital) return { valida: false, alterada: false, datos: null };

  const fd = doc.firma_digital as {
    hash: string;
    firma: string;
    algoritmo: string;
    firmado_at: string;
    medico_id: string;
  };

  // Clave que firmó: por firma_logs.clave_id; fallback a la última del médico.
  const { data: log } = await supabase
    .from("firma_logs")
    .select("clave_id")
    .eq("documento_id", documentoId)
    .limit(1)
    .maybeSingle();

  let clavePublica: string | null = null;
  if (log?.clave_id) {
    const { data: c } = await supabase
      .from("medico_claves")
      .select("clave_publica")
      .eq("id", log.clave_id)
      .single();
    clavePublica = c?.clave_publica ?? null;
  }
  if (!clavePublica) {
    const { data: c } = await supabase
      .from("medico_claves")
      .select("clave_publica")
      .eq("medico_id", fd.medico_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    clavePublica = c?.clave_publica ?? null;
  }
  if (!clavePublica) return { valida: false, alterada: false, datos: null };

  const hashActual = hashSHA256(canonicalJSON(contenidoFirmable(doc)));
  const alterada = hashActual !== fd.hash;
  const firmaValida = verificar(fd.hash, fd.firma, clavePublica);

  return {
    valida: firmaValida && !alterada,
    alterada,
    datos: {
      hash_original: fd.hash,
      hash_actual: hashActual,
      algoritmo: fd.algoritmo,
      firmado_at: fd.firmado_at,
      medico_id: fd.medico_id,
    },
  };
}
