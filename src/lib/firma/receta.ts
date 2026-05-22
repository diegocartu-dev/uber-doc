import { createAdminClient } from "@/lib/supabase/admin";
import {
  hashSHA256,
  firmar,
  verificar,
  desencriptarClavePrivada,
} from "./crypto";

// Fix I-5: Ventana ampliada a 5 minutos, consistente con OTP_EXPIRY_MS.
// Antes era 2 min midiendo desde created_at — provocaba rechazos falsos
// cuando el médico tardaba >2min en ingresar el OTP pero <5min (válido).
const OTP_VENTANA_MS = 5 * 60 * 1000;

// Fix 3.3: JSON.stringify no garantiza orden de keys.
// JSONB en PostgreSQL puede reordenar keys al almacenar.
// canonicalJSON ordena keys recursivamente para hash determinístico.
function canonicalJSON(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean" || typeof value === "number") {
    return JSON.stringify(value);
  }
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return "[" + value.map(canonicalJSON).join(",") + "]";
  }
  if (typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    const pairs = keys.map(
      (k) => JSON.stringify(k) + ":" + canonicalJSON((value as Record<string, unknown>)[k])
    );
    return "{" + pairs.join(",") + "}";
  }
  return JSON.stringify(value);
}

export { canonicalJSON };

type FirmaResult = {
  ok: true;
  hash: string;
  firma: string;
  firmado_at: string;
} | {
  ok: false;
  error: string;
};

// Fix C-3 / 5.4: Parámetros opcionales para logging de no-repudio
export async function firmarReceta(
  recetaId: string,
  medicoId: string,
  otpId: string,
  meta?: { ip?: string; userAgent?: string }
): Promise<FirmaResult> {
  const supabase = createAdminClient();

  // Fix 5.1: Verificar OTP válido antes de firmar
  const { data: otp } = await supabase
    .from("otp_firma")
    .select("id, medico_id, usado, consulta_id, turno_id, created_at, consumido_para_receta_id")
    .eq("id", otpId)
    .single();

  if (!otp) {
    return { ok: false, error: "OTP no encontrado" };
  }

  if (!otp.usado) {
    return { ok: false, error: "OTP no fue validado" };
  }

  if (otp.medico_id !== medicoId) {
    return { ok: false, error: "OTP no pertenece a este médico" };
  }

  // Fix I-1: OTP one-time-use — cada OTP solo puede firmar UNA receta
  if (otp.consumido_para_receta_id) {
    return { ok: false, error: "Este código ya fue usado para firmar otra receta" };
  }

  const otpAge = Date.now() - new Date(otp.created_at).getTime();
  if (otpAge > OTP_VENTANA_MS) {
    return { ok: false, error: "OTP expirado para firma" };
  }

  const { data: receta } = await supabase
    .from("recetas")
    .select("id, medico_id, estado, datos_prescripcion, firma_digital, consulta_id, turno_id")
    .eq("id", recetaId)
    .single();

  if (!receta) {
    return { ok: false, error: "Receta no encontrada" };
  }

  if (receta.medico_id !== medicoId) {
    return { ok: false, error: "No autorizado" };
  }

  if (receta.firma_digital) {
    return { ok: false, error: "Receta ya firmada" };
  }

  if (receta.estado !== "borrador") {
    return { ok: false, error: "Solo se pueden firmar recetas en borrador" };
  }

  if (!receta.consulta_id && !receta.turno_id) {
    return { ok: false, error: "Receta sin consulta ni turno asociado" };
  }

  // Verificar scope: el OTP debe corresponder a la misma consulta/turno
  if (receta.consulta_id && otp.consulta_id !== receta.consulta_id) {
    return { ok: false, error: "OTP no corresponde a esta consulta" };
  }
  if (receta.turno_id && otp.turno_id !== receta.turno_id) {
    return { ok: false, error: "OTP no corresponde a este turno" };
  }

  // Fix I-3: Solo usar clave activa (no revocada)
  const { data: claves } = await supabase
    .from("medico_claves")
    .select("id, clave_publica, clave_privada_enc")
    .eq("medico_id", medicoId)
    .eq("activa", true)
    .single();

  if (!claves) {
    return { ok: false, error: "Médico sin claves de firma activas" };
  }

  const contenido = canonicalJSON(receta.datos_prescripcion);
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

  const { data: updated, error: updateError } = await supabase
    .from("recetas")
    .update({
      firma_digital: firmaDigital,
      hash_pdf: hash,
      estado: "emitida",
      fecha_emision: firmadoAt,
    })
    .eq("id", recetaId)
    .eq("medico_id", medicoId)
    .eq("estado", "borrador")
    .select("id");

  if (updateError || !updated || updated.length === 0) {
    return { ok: false, error: "La receta ya fue firmada o cambió de estado" };
  }

  // Fix I-1: Marcar OTP como consumido para esta receta (atómico)
  // Roberto: verificar resultado — unique index en DB es el guard real,
  // pero logueamos si el UPDATE falla por TOCTOU.
  const { error: otpConsumoError } = await supabase
    .from("otp_firma")
    .update({ consumido_para_receta_id: recetaId })
    .eq("id", otpId)
    .is("consumido_para_receta_id", null);

  if (otpConsumoError) {
    console.error("[firma] OTP consumption failed (receta already signed via .eq estado guard):", otpConsumoError.message);
  }

  // Fix C-3 / 5.4: Registro inmutable en firma_logs (no-repudio)
  await supabase.from("firma_logs").insert({
    receta_id: recetaId,
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

export async function verificarFirma(
  recetaId: string
): Promise<VerificacionResult> {
  const supabase = createAdminClient();

  const { data: receta } = await supabase
    .from("recetas")
    .select("datos_prescripcion, firma_digital, medico_id")
    .eq("id", recetaId)
    .single();

  if (!receta?.firma_digital) {
    return { valida: false, alterada: false, datos: null };
  }

  const fd = receta.firma_digital as {
    hash: string;
    firma: string;
    algoritmo: string;
    firmado_at: string;
    medico_id: string;
  };

  // Fix I-3: Buscar clave que firmó. Si hay firma_logs con clave_id, usarla.
  // Fallback: buscar cualquier clave del médico (activa o revocada) para verificación histórica.
  const { data: log } = await supabase
    .from("firma_logs")
    .select("clave_id")
    .eq("receta_id", recetaId)
    .limit(1)
    .maybeSingle();

  let clavePublica: string | null = null;

  if (log?.clave_id) {
    const { data: claveEspecifica } = await supabase
      .from("medico_claves")
      .select("clave_publica")
      .eq("id", log.clave_id)
      .single();
    clavePublica = claveEspecifica?.clave_publica ?? null;
  }

  if (!clavePublica) {
    // Fallback para firmas anteriores al sistema de logs
    const { data: claves } = await supabase
      .from("medico_claves")
      .select("clave_publica")
      .eq("medico_id", fd.medico_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    clavePublica = claves?.clave_publica ?? null;
  }

  if (!clavePublica) {
    return { valida: false, alterada: false, datos: null };
  }

  const contenidoActual = canonicalJSON(receta.datos_prescripcion);
  const hashActual = hashSHA256(contenidoActual);
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
