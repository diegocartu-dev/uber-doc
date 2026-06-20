// src/lib/whatsapp.ts
// Aviso al médico por WhatsApp — canal de respaldo del Web Push para cuando el push
// no llega (iOS con la app cerrada / teléfono bloqueado). Va AL LADO del push, no lo
// reemplaza.
//
// Diseño:
// - INERTE por defecto: sin credenciales Twilio o con el flag `whatsapp_medico` apagado,
//   todas las funciones son no-op y devuelven false. No rompe nada en producción.
// - Proveedor: Twilio (REST API directa con fetch, sin SDK → sin dependencias nuevas).
// - Dos plantillas utility aprobadas por Meta (ContentSid), una por evento:
//     A) docto_aceptar_paciente   — el paciente solicitó una Consulta Inmediata y el
//        médico debe aceptarla para que pueda pagar/ingresar. {{1}}=médico, {{2}}=paciente.
//     B) docto_paciente_esperando — hay 1+ pacientes esperando en la sala hace unos
//        minutos. {{1}}=médico, {{2}}="un paciente"/"N pacientes". Aplica a TODOS los
//        canales (CI, turno programado, consultorio particular).
// - El ContentSid se pasa POR LLAMADA (antes había uno solo global y las dos plantillas
//   se pisaban). Los ContentSid son IDs de plantilla, no secretos → van como constantes.

import { createAdminClient } from "@/lib/supabase/admin";

const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID ?? "";
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN ?? "";
// Número emisor en formato Twilio, ej: "whatsapp:+15722339571" (sender productivo de Docto)
const TWILIO_FROM = process.env.TWILIO_WHATSAPP_FROM ?? "";

// ContentSids de las plantillas Meta aprobadas (UTILITY). NO son secretos.
export const PLANTILLA_ACEPTAR_PACIENTE = "HX28f31177bfee51e64e6432754fb08899"; // docto_aceptar_paciente
export const PLANTILLA_PACIENTE_ESPERANDO = "HX5b80894015160f73a08fa5b6731c5528"; // docto_paciente_esperando

// No reenviar "paciente esperando" al mismo médico dentro de esta ventana. Cubre dos
// casos a la vez: el cron repush cada 10 min y los re-render de la página de sala.
const THROTTLE_ESPERA_MIN = 30;

function configurado(): boolean {
  return Boolean(TWILIO_SID && TWILIO_TOKEN && TWILIO_FROM);
}

async function flagWhatsappOn(): Promise<boolean> {
  try {
    const { getFlag } = await import("@/lib/feature-flags");
    return await getFlag("whatsapp_medico");
  } catch {
    return false;
  }
}

/**
 * Normaliza un teléfono argentino a E.164 móvil para WhatsApp: +549XXXXXXXXXX.
 *
 * Móvil nacional argentino = 10 dígitos (código de área 2-4 + abonado). Esta función
 * pela el país (54), el 9 de móvil, el 0 de larga distancia y el viejo prefijo "15"
 * embebido, y RECHAZA (devuelve null) cualquier cosa que no quede en exactamente 10
 * dígitos — así nunca arma un número equivocado por tomar "los últimos 10".
 */
export function normalizarTelefonoAR(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = String(raw).replace(/\D/g, ""); // solo dígitos
  if (!s) return null;

  if (s.startsWith("00")) s = s.slice(2); // salida internacional
  if (s.startsWith("54")) s = s.slice(2); // país
  if (s.startsWith("9")) s = s.slice(1); // 9 de móvil (lo re-agregamos al final)
  if (s.startsWith("0")) s = s.slice(1); // 0 de larga distancia

  // Viejo prefijo de móvil "15" embebido entre el área y el abonado (área + 15 + abonado
  // = 12 díg). Probamos áreas de 2, 3 o 4 dígitos y removemos el "15" si así queda en 10.
  if (s.length === 12) {
    for (const areaLen of [2, 3, 4]) {
      if (s.slice(areaLen, areaLen + 2) === "15") {
        const candidato = s.slice(0, areaLen) + s.slice(areaLen + 2);
        if (candidato.length === 10) {
          s = candidato;
          break;
        }
      }
    }
  }

  if (s.length !== 10) return null; // móvil nacional = 10 díg exactos
  return `+549${s}`;
}

type Variables = Record<string, string>;

/** Envío de bajo nivel vía Twilio. No revisa flag ni opt-in (eso lo hace el caller). */
async function enviarTwilio(toE164: string, contentSid: string, variables: Variables): Promise<boolean> {
  const body = new URLSearchParams();
  body.set("From", TWILIO_FROM);
  body.set("To", `whatsapp:${toE164}`);
  body.set("ContentSid", contentSid);
  body.set("ContentVariables", JSON.stringify(variables));

  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
      }
    );
    if (!res.ok) {
      // NO loguear el body completo de Twilio: en algunos errores (ej. 21211) incluye
      // el número "To" (celular del médico). Solo status + código de error de Twilio.
      const errText = await res.text();
      let code = "";
      try { code = String(JSON.parse(errText)?.code ?? ""); } catch {}
      console.error("[whatsapp] Twilio error", res.status, code ? `code=${code}` : "");
      return false;
    }
    return true;
  } catch (err) {
    console.error("[whatsapp] fallo de envío:", err);
    return false;
  }
}

const primerNombre = (n: string | null | undefined): string => (n ?? "").trim().split(/\s+/)[0] || "Doctor/a";

/**
 * TRIGGER A — el paciente solicitó una Consulta Inmediata; avisamos al médico para que
 * la ACEPTE (recién ahí el paciente puede pagar e ingresar). Solo CI.
 * Fire-and-forget: el caller hace `.catch(() => {})`.
 */
export async function avisarMedicoAceptarWhatsApp(medicoId: string, nombrePaciente: string): Promise<boolean> {
  if (!(await flagWhatsappOn())) return false;
  if (!configurado()) return false;

  const supabase = createAdminClient();
  const { data: medico } = await supabase
    .from("medicos")
    .select("nombre_completo, celular_personal")
    .eq("id", medicoId)
    .single();
  if (!medico) return false;

  // Solo celular_personal: `telefono` es el fijo de consultorio y WhatsApp no entra ahí.
  const toE164 = normalizarTelefonoAR(medico.celular_personal);
  if (!toE164) {
    console.log("[whatsapp] médico sin celular válido (aceptar):", medicoId);
    return false;
  }

  return enviarTwilio(toE164, PLANTILLA_ACEPTAR_PACIENTE, {
    "1": primerNombre(medico.nombre_completo),
    "2": (nombrePaciente ?? "").trim() || "un paciente",
  });
}

/**
 * TRIGGER B — hay 1+ pacientes esperando en la sala (CI, turno o consultorio particular).
 * El momento crítico. Con throttle por médico (THROTTLE_ESPERA_MIN) para no spamear desde
 * el cron (cada 10 min) ni desde los re-render de la página de sala.
 *
 * @param cantidadTexto valor para {{2}}: "un paciente" o "N pacientes".
 * Fire-and-forget: el caller hace `.catch(() => {})`.
 */
export async function avisarMedicoEsperandoWhatsApp(medicoId: string, cantidadTexto: string): Promise<boolean> {
  if (!(await flagWhatsappOn())) return false;
  if (!configurado()) return false;

  const supabase = createAdminClient();
  const { data: medico } = await supabase
    .from("medicos")
    .select("nombre_completo, celular_personal, ultimo_whatsapp_espera_at")
    .eq("id", medicoId)
    .single();
  if (!medico) return false;

  // Throttle: si ya le avisamos hace menos de THROTTLE_ESPERA_MIN, no reenviar.
  if (medico.ultimo_whatsapp_espera_at) {
    const minutos = (Date.now() - new Date(medico.ultimo_whatsapp_espera_at).getTime()) / 60000;
    if (minutos < THROTTLE_ESPERA_MIN) return false;
  }

  const toE164 = normalizarTelefonoAR(medico.celular_personal);
  if (!toE164) {
    console.log("[whatsapp] médico sin celular válido (esperando):", medicoId);
    return false;
  }

  const ok = await enviarTwilio(toE164, PLANTILLA_PACIENTE_ESPERANDO, {
    "1": primerNombre(medico.nombre_completo),
    "2": (cantidadTexto ?? "").trim() || "un paciente",
  });

  if (ok) {
    await supabase
      .from("medicos")
      .update({ ultimo_whatsapp_espera_at: new Date().toISOString() })
      .eq("id", medicoId);
  }
  return ok;
}
