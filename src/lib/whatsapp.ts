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
import { normalizarTelefonoAR } from "@/lib/telefono";
import { formatNombreMedico } from "@/lib/utils/texto";

// La normalización vive en @/lib/telefono (módulo puro, importable desde el
// cliente — la usa la validación del paso 1 del registro médico). Se re-exporta
// acá para no romper los imports existentes.
export { normalizarTelefonoAR };

const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID ?? "";
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN ?? "";

/**
 * Twilio exige el prefijo "whatsapp:" en el From; sin él rechaza TODO con error 21910
 * (canal incompatible). La env var de producción estuvo semanas sin el prefijo y el
 * canal entero murió en silencio (caso Verónica/Romina, 16/07/2026). Normalizamos acá
 * para que el formato de la env var nunca más pueda apagar el canal: aceptamos el
 * número con o sin prefijo, y con espacios/saltos de línea colgados (trampa conocida
 * de `vercel env add`).
 */
function normalizarFromWhatsApp(raw: string | undefined): string {
  const s = (raw ?? "").trim();
  if (!s) return "";
  return s.startsWith("whatsapp:") ? s : `whatsapp:${s}`;
}

// Número emisor en formato Twilio, ej: "whatsapp:+15722339571" (sender productivo de Docto)
const TWILIO_FROM = normalizarFromWhatsApp(process.env.TWILIO_WHATSAPP_FROM);

// ContentSids de las plantillas Meta aprobadas (UTILITY). NO son secretos.
// v2 (aprobadas por Meta 26/07/2026): mismo cuerpo + cierre "No respondas este
// canal: es solo de alertas de turnos. Escribinos a soporte@docto.com.ar" —
// regla de Diego 25/07 tras el caso Almeida (la médica escribió 3 veces al
// canal de avisos y nadie lee ahí). v1: HX28f31177… / HX5b80894…
export const PLANTILLA_ACEPTAR_PACIENTE = "HX25f4187f6a159560fe86ed3087ceb8ca"; // docto_aceptar_paciente_v2
export const PLANTILLA_PACIENTE_ESPERANDO = "HX8023671239ec07bdd66e6e238438b81b"; // docto_paciente_esperando_v2
// Turnos al profesional (05/10/2026). Enviadas a Meta el 05/10: hasta que las
// apruebe, Twilio rechaza el envío y queda registrado como error_twilio.
export const PLANTILLA_TURNO_RESERVADO = "HXa46c1e245149f4c4a0fca4e94c85ea96"; // docto_turno_reservado_v1
export const PLANTILLA_TURNO_15MIN = "HXc46a7a0f525a06e7f0236f76e468552e"; // docto_turno_15min_v1
export const PLANTILLA_PACIENTE_ACEPTADA = "HX92655588afc1443f60850e50b5a45828"; // docto_paciente_aceptada_v2 (al PACIENTE, 10/09/2026)

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

type Variables = Record<string, string>;

/**
 * Registro de cada intento de aviso en `whatsapp_envios` (decisión Diego,
 * 20/08/2026). Hasta hoy un aviso podía no salir —sin celular, flag apagado,
 * error de Twilio, throttle— y no quedaba NINGÚN rastro consultable: solo un
 * console.log en Vercel, que caduca. Con el canal entero muerto un mes
 * (16/06→17/07) nadie se enteró justamente por esto.
 *
 * Best-effort SIEMPRE: registrar jamás puede impedir (ni demorar) el envío.
 * NUNCA se guarda el número de teléfono — es dato personal y ya vive en
 * `medicos`; acá solo queda el resultado y el SID de Twilio para rastrear la
 * entrega real en su consola.
 */
type ResultadoEnvio =
  | "enviado"
  | "sin_celular"
  | "flag_apagado"
  | "sin_credenciales"
  | "error_twilio"
  | "throttled"
  /** Destinatario de prueba: no se manda (06/10/2026). Ver esCuentaDePrueba. */
  | "cuenta_test";

type ContextoEnvio = {
  consultaId?: string | null;
  turnoId?: string | null;
  /** Qué punto del producto disparó el aviso (ej. "solicitud_ci", "cron_repush"). */
  disparador?: string;
};

/**
 * ¿El destinatario es una cuenta de prueba? (06/10/2026) A ninguna se le manda
 * WhatsApp: los pacientes de prueba tienen teléfonos que NO son del equipo
 * (verificado: ninguno es el de Diego), y la prueba de punta a punta corre
 * contra producción. El aviso queda registrado como "cuenta_test", así la
 * prueba igual comprueba que el camino del aviso se ejecutó. Para recibirlos
 * a propósito: env WHATSAPP_A_CUENTAS_TEST=1.
 */
async function esCuentaDePrueba(p: { medicoId?: string | null; pacienteId?: string | null }): Promise<boolean> {
  if (process.env.WHATSAPP_A_CUENTAS_TEST === "1") return false;
  const admin = createAdminClient();
  if (p.medicoId) {
    const { data } = await admin.from("medicos").select("es_cuenta_test").eq("id", p.medicoId).maybeSingle();
    if (data?.es_cuenta_test) return true;
  }
  if (p.pacienteId) {
    const { data } = await admin.from("pacientes").select("es_cuenta_test").eq("id", p.pacienteId).maybeSingle();
    if (data?.es_cuenta_test) return true;
  }
  return false;
}

function registrarEnvio(params: {
  /** Destinatario médico. NULL en los avisos al paciente, para no inflar los
   *  conteos de avisos al médico (el profesional queda vía `consulta_id`). */
  medicoId?: string | null;
  /** Destinatario paciente (`pacientes.id`). Columna agregada el 10/09/2026. */
  pacienteId?: string | null;
  plantilla: string;
  resultado: ResultadoEnvio;
  ctx?: ContextoEnvio;
  twilioSid?: string | null;
  twilioErrorCode?: string | null;
}): void {
  void (async () => {
    const admin = createAdminClient();
    await admin.from("whatsapp_envios").insert({
      medico_id: params.medicoId ?? null,
      paciente_id: params.pacienteId ?? null,
      consulta_id: params.ctx?.consultaId ?? null,
      turno_id: params.ctx?.turnoId ?? null,
      plantilla: params.plantilla,
      disparador: params.ctx?.disparador ?? "desconocido",
      resultado: params.resultado,
      twilio_sid: params.twilioSid ?? null,
      twilio_error_code: params.twilioErrorCode ?? null,
    });
  })().catch(() => {});
}

/**
 * Piloto "despertar oferta dormida" (Diego 31/08): un paciente está buscando
 * en la provincia del profesional y no hay nadie en línea. Los GUARDRAILS
 * (opt-in, tope diario, ventana horaria, candidatos) viven en el caller
 * (/api/despertar-oferta) — acá solo el transporte y el registro, como el
 * resto de los avisos. Inerte sin TWILIO_CONTENT_SID_DEMANDA: la plantilla
 * tiene que existir en Twilio y aprobarla Meta antes de que esto mande nada.
 */
export async function avisarDemandaProvincia(
  medicoId: string,
  provincia: string,
  ctx?: ContextoEnvio,
): Promise<boolean> {
  const PLANTILLA = "demanda_provincia";
  const contentSid = process.env.TWILIO_CONTENT_SID_DEMANDA;
  if (!contentSid) {
    registrarEnvio({ medicoId, plantilla: PLANTILLA, resultado: "sin_credenciales", ctx });
    return false;
  }
  if (!(await flagWhatsappOn())) {
    registrarEnvio({ medicoId, plantilla: PLANTILLA, resultado: "flag_apagado", ctx });
    return false;
  }
  if (!configurado()) {
    registrarEnvio({ medicoId, plantilla: PLANTILLA, resultado: "sin_credenciales", ctx });
    return false;
  }

  const admin = createAdminClient();
  const { data: medico } = await admin
    .from("medicos")
    .select("nombre_completo, celular_personal")
    .eq("id", medicoId)
    .maybeSingle();
  if (!medico) return false;

  const toE164 = normalizarTelefonoAR(medico.celular_personal);
  if (!toE164) {
    registrarEnvio({ medicoId, plantilla: PLANTILLA, resultado: "sin_celular", ctx });
    return false;
  }

  if (await esCuentaDePrueba({ medicoId })) {
    registrarEnvio({ medicoId, plantilla: PLANTILLA, resultado: "cuenta_test", ctx });
    return false;
  }

  const r = await enviarTwilioDetallado(toE164, contentSid, {
    "1": primerNombre(medico.nombre_completo),
    "2": provincia,
  });
  registrarEnvio({
    medicoId,
    plantilla: PLANTILLA,
    resultado: r.ok ? "enviado" : "error_twilio",
    ctx,
    twilioSid: r.sid,
    twilioErrorCode: r.errorCode,
  });
  return r.ok;
}

/** ¿Hay credenciales Twilio configuradas en este deploy? (lo usa también el
 *  módulo de avisos institucionales — mismo criterio, una sola fuente). */
export function twilioConfigurado(): boolean {
  return configurado();
}

/** Envío de bajo nivel vía Twilio. No revisa flag ni opt-in (eso lo hace el
 *  caller). Exportada para los avisos institucionales (src/lib/institucional/
 *  avisos.ts) — mismo transporte, otras plantillas; en B2C nada cambia. */
export async function enviarTwilio(toE164: string, contentSid: string, variables: Variables): Promise<boolean> {
  const r = await enviarTwilioDetallado(toE164, contentSid, variables);
  return r.ok;
}

type DetalleTwilio = { ok: boolean; sid: string | null; errorCode: string | null };

/**
 * El estado de entrega de un aviso, preguntado a Twilio si nuestra base no lo
 * tiene (06/10/2026). La confirmación de Twilio a veces llega antes de que
 * exista la fila del envío y se pierde: de 34 avisos "sin estado", Twilio tenía
 * el estado real de los 34. Lo que averigua lo deja escrito en la fila. Nunca
 * lanza: si Twilio no contesta, devuelve lo que había.
 */
export async function estadoDeEntrega(fila: {
  resultado: string | null;
  twilio_sid?: string | null;
  twilio_status: string | null;
}): Promise<string | null> {
  if (fila.twilio_status || fila.resultado !== "enviado" || !fila.twilio_sid || !TWILIO_SID || !TWILIO_TOKEN) {
    return fila.twilio_status;
  }
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages/${fila.twilio_sid}.json`, {
      headers: { Authorization: `Basic ${Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString("base64")}` },
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return null;
    const estado = ((await res.json()) as { status?: string }).status ?? null;
    if (estado) {
      await createAdminClient()
        .from("whatsapp_envios")
        .update({ twilio_status: estado, twilio_status_at: new Date().toISOString() })
        .eq("twilio_sid", fila.twilio_sid)
        .is("twilio_status", null);
    }
    return estado;
  } catch {
    return null;
  }
}

/** Igual que `enviarTwilio` pero conservando el SID del mensaje y el código de
 *  error — lo que se persiste en `whatsapp_envios`. */
async function enviarTwilioDetallado(toE164: string, contentSid: string, variables: Variables): Promise<DetalleTwilio> {
  const body = new URLSearchParams();
  body.set("From", TWILIO_FROM);
  body.set("To", `whatsapp:${toE164}`);
  body.set("ContentSid", contentSid);
  body.set("ContentVariables", JSON.stringify(variables));
  // Estado real de entrega (hallazgo 27/08: "enviado" solo dice que Twilio
  // aceptó). El webhook vive en /api/twilio/status y la URL viene por env —
  // apuntando a WWW (regla: los webhooks al apex se pierden en el 307). Sin la
  // env var no se manda el parámetro y todo queda exactamente como antes:
  // previews y la instancia institucional no ensucian el webhook de prod.
  const statusCallback = process.env.WHATSAPP_STATUS_CALLBACK_URL;
  if (statusCallback) body.set("StatusCallback", statusCallback);

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
      return { ok: false, sid: null, errorCode: code || String(res.status) };
    }
    let sid: string | null = null;
    try { sid = String((await res.json())?.sid ?? "") || null; } catch {}
    return { ok: true, sid, errorCode: null };
  } catch (err) {
    console.error("[whatsapp] fallo de envío:", err);
    return { ok: false, sid: null, errorCode: "fetch_failed" };
  }
}

const primerNombre = (n: string | null | undefined): string => (n ?? "").trim().split(/\s+/)[0] || "Doctor/a";

/**
 * TRIGGER C — el profesional ACEPTÓ la consulta inmediata. Es el único momento
 * del flujo en que el que tiene que actuar es el PACIENTE (pagar), y es justo
 * cuando ya no está mirando la pantalla. Decisión de Diego (10/09/2026) sobre el
 * diagnóstico del 09/09: de 4 aceptadas sin pago, en 3 el paciente se había ido
 * de la sala antes de la aceptación (a los 9 y 15 segundos) o tuvo 22 segundos;
 * el mail que se agregó el 08/09 llegó en el mismo segundo y no alcanzó. El
 * WhatsApp al médico, en cambio, se lee en segundos (medido 27/08 y 09/09).
 *
 * Mismo transporte, misma tabla y mismo webhook de entrega que los avisos al
 * médico. La plantilla la aprueba Meta y su ContentSid viaja por env var, como
 * `demanda_provincia`: sin la variable esto es inerte y deja rastro
 * (`sin_credenciales`), nunca rompe la aceptación.
 *
 * {{1}}=primer nombre del paciente, {{2}}=profesional con tratamiento,
 * {{3}}=id de la consulta (sufijo dinámico del botón → /sala-espera/{{3}}).
 * Fire-and-forget: el caller hace `.catch(() => {})`.
 */
export async function avisarPacienteAceptadaWhatsApp(
  consultaId: string,
  ctx?: ContextoEnvio,
): Promise<boolean> {
  const PLANTILLA = "paciente_aceptada";
  const contexto: ContextoEnvio = { consultaId, disparador: "aceptacion_ci", ...ctx };

  const admin = createAdminClient();
  const { data: consulta } = await admin
    .from("consultas")
    .select("paciente_id, medico_id")
    .eq("id", consultaId)
    .maybeSingle();
  if (!consulta) return false;

  // `consultas.paciente_id` es el user_id; la ficha está en `pacientes` por user_id.
  const [{ data: paciente }, { data: medico }] = await Promise.all([
    admin
      .from("pacientes")
      .select("id, nombre_completo, telefono")
      .eq("user_id", consulta.paciente_id)
      .maybeSingle(),
    admin
      .from("medicos")
      .select("nombre_completo, titulo")
      .eq("id", consulta.medico_id)
      .maybeSingle(),
  ]);

  const base = { pacienteId: paciente?.id ?? null, plantilla: PLANTILLA, ctx: contexto };

  // ContentSid de `docto_paciente_aceptada_v2` (creada en Twilio el 10/09/2026,
  // categoría UTILITY). Como los otros dos ContentSid de este archivo: es un id
  // de plantilla, no un secreto, así que vive acá; la env var solo lo pisa.
  // Hasta que Meta la apruebe, Twilio rechaza el envío y queda `error_twilio`
  // con el código — o sea, la aprobación se ve en la tabla, no hace falta otro
  // deploy.
  const contentSid = process.env.TWILIO_CONTENT_SID_PACIENTE_ACEPTADA || PLANTILLA_PACIENTE_ACEPTADA;
  if (!contentSid || !configurado()) {
    registrarEnvio({ ...base, resultado: "sin_credenciales" });
    return false;
  }
  // Mismo interruptor que el resto del canal: es el kill switch de WhatsApp.
  if (!(await flagWhatsappOn())) {
    registrarEnvio({ ...base, resultado: "flag_apagado" });
    return false;
  }
  if (!paciente) return false;

  const toE164 = normalizarTelefonoAR(paciente.telefono);
  if (!toE164) {
    registrarEnvio({ ...base, resultado: "sin_celular" });
    return false;
  }

  if (await esCuentaDePrueba({ pacienteId: base.pacienteId })) {
    registrarEnvio({ ...base, resultado: "cuenta_test" });
    return false;
  }

  const r = await enviarTwilioDetallado(toE164, contentSid, {
    "1": (paciente.nombre_completo ?? "").trim().split(/\s+/)[0] || "paciente",
    "2": formatNombreMedico(medico?.nombre_completo ?? "", medico?.titulo) || "El profesional",
    "3": consultaId,
  });
  registrarEnvio({
    ...base,
    resultado: r.ok ? "enviado" : "error_twilio",
    twilioSid: r.sid,
    twilioErrorCode: r.errorCode,
  });
  return r.ok;
}

/**
 * TRIGGER A — el paciente solicitó una Consulta Inmediata; avisamos al médico para que
 * la ACEPTE (recién ahí el paciente puede pagar e ingresar). Solo CI.
 * Fire-and-forget: el caller hace `.catch(() => {})`.
 */
export async function avisarMedicoAceptarWhatsApp(
  medicoId: string,
  nombrePaciente: string,
  ctx?: ContextoEnvio,
): Promise<boolean> {
  const PLANTILLA = "aceptar_paciente";
  if (!(await flagWhatsappOn())) {
    registrarEnvio({ medicoId, plantilla: PLANTILLA, resultado: "flag_apagado", ctx });
    return false;
  }
  if (!configurado()) {
    registrarEnvio({ medicoId, plantilla: PLANTILLA, resultado: "sin_credenciales", ctx });
    return false;
  }

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
    registrarEnvio({ medicoId, plantilla: PLANTILLA, resultado: "sin_celular", ctx });
    return false;
  }

  if (await esCuentaDePrueba({ medicoId })) {
    registrarEnvio({ medicoId, plantilla: PLANTILLA, resultado: "cuenta_test", ctx });
    return false;
  }

  const r = await enviarTwilioDetallado(toE164, PLANTILLA_ACEPTAR_PACIENTE, {
    "1": primerNombre(medico.nombre_completo),
    "2": (nombrePaciente ?? "").trim() || "un paciente",
  });
  registrarEnvio({
    medicoId,
    plantilla: PLANTILLA,
    resultado: r.ok ? "enviado" : "error_twilio",
    ctx,
    twilioSid: r.sid,
    twilioErrorCode: r.errorCode,
  });
  return r.ok;
}

/**
 * TRIGGER B — hay 1+ pacientes esperando en la sala (CI, turno o consultorio particular).
 * El momento crítico. Con throttle por médico (THROTTLE_ESPERA_MIN) para no spamear desde
 * el cron (cada 10 min) ni desde los re-render de la página de sala.
 *
 * @param cantidadTexto valor para {{2}}: "un paciente" o "N pacientes".
 * Fire-and-forget: el caller hace `.catch(() => {})`.
 */
export async function avisarMedicoEsperandoWhatsApp(
  medicoId: string,
  cantidadTexto: string,
  ctx?: ContextoEnvio,
): Promise<boolean> {
  const PLANTILLA = "paciente_esperando";
  if (!(await flagWhatsappOn())) {
    registrarEnvio({ medicoId, plantilla: PLANTILLA, resultado: "flag_apagado", ctx });
    return false;
  }
  if (!configurado()) {
    registrarEnvio({ medicoId, plantilla: PLANTILLA, resultado: "sin_credenciales", ctx });
    return false;
  }

  const supabase = createAdminClient();
  const { data: medico } = await supabase
    .from("medicos")
    .select("nombre_completo, celular_personal, ultimo_whatsapp_espera_at")
    .eq("id", medicoId)
    .single();
  if (!medico) return false;

  // Throttle: si ya le avisamos hace menos de THROTTLE_ESPERA_MIN, no reenviar.
  // Se registra: "no le avisamos porque ya le habíamos avisado" también es una
  // respuesta que el panel tiene que poder dar.
  if (medico.ultimo_whatsapp_espera_at) {
    const minutos = (Date.now() - new Date(medico.ultimo_whatsapp_espera_at).getTime()) / 60000;
    if (minutos < THROTTLE_ESPERA_MIN) {
      registrarEnvio({ medicoId, plantilla: PLANTILLA, resultado: "throttled", ctx });
      return false;
    }
  }

  const toE164 = normalizarTelefonoAR(medico.celular_personal);
  if (!toE164) {
    console.log("[whatsapp] médico sin celular válido (esperando):", medicoId);
    registrarEnvio({ medicoId, plantilla: PLANTILLA, resultado: "sin_celular", ctx });
    return false;
  }

  if (await esCuentaDePrueba({ medicoId })) {
    registrarEnvio({ medicoId, plantilla: PLANTILLA, resultado: "cuenta_test", ctx });
    return false;
  }

  const r = await enviarTwilioDetallado(toE164, PLANTILLA_PACIENTE_ESPERANDO, {
    "1": primerNombre(medico.nombre_completo),
    "2": (cantidadTexto ?? "").trim() || "un paciente",
  });
  registrarEnvio({
    medicoId,
    plantilla: PLANTILLA,
    resultado: r.ok ? "enviado" : "error_twilio",
    ctx,
    twilioSid: r.sid,
    twilioErrorCode: r.errorCode,
  });

  if (r.ok) {
    await supabase
      .from("medicos")
      .update({ ultimo_whatsapp_espera_at: new Date().toISOString() })
      .eq("id", medicoId);
  }
  return r.ok;
}

/**
 * Avisos al PROFESIONAL por un TURNO pago (05/10/2026): al confirmarse el pago
 * ("tenés un turno hoy a las 21:20") y 15 minutos antes. Hasta ahora el
 * profesional recibía solo push (que un iPhone sin la app no muestra) y el
 * WhatsApp salía recién cuando el paciente ya estaba en la sala, a la hora.
 *
 * Sin el tope de 30 minutos de "paciente esperando": acá el dedupe es por
 * turno y plantilla (whatsapp_envios), una vez cada uno. Plantillas
 * docto_turno_reservado_v1 y docto_turno_15min_v1 (textos aprobados por Diego
 * el 05/10/2026, enviadas a Meta ese día).
 *
 * Variables de la plantilla: {{1}} nombre del profesional, {{2}} fecha
 * ("sáb 5/10" u "hoy"), {{3}} hora ("21:20").
 */
export async function avisarMedicoTurnoWhatsApp(
  medicoId: string,
  turno: { turnoId: string; fecha: string; hora: string; cuando: "reservado" | "15min" },
): Promise<boolean> {
  const PLANTILLA = turno.cuando === "reservado" ? "turno_reservado" : "turno_15min";
  // Constante en el código (como las otras plantillas): la env solo la pisa.
  const contentSid =
    turno.cuando === "reservado"
      ? process.env.TWILIO_CONTENT_SID_TURNO_RESERVADO || PLANTILLA_TURNO_RESERVADO
      : process.env.TWILIO_CONTENT_SID_TURNO_15MIN || PLANTILLA_TURNO_15MIN;
  const ctx: ContextoEnvio = { turnoId: turno.turnoId, disparador: turno.cuando === "reservado" ? "pago_turno" : "cron_15min" };

  if (!(await flagWhatsappOn())) {
    registrarEnvio({ medicoId, plantilla: PLANTILLA, resultado: "flag_apagado", ctx });
    return false;
  }
  if (!configurado() || !contentSid) {
    registrarEnvio({ medicoId, plantilla: PLANTILLA, resultado: "sin_credenciales", ctx });
    return false;
  }

  const supabase = createAdminClient();
  // Una vez por turno y plantilla, cualquiera haya sido el resultado real de
  // Twilio: insistir no arregla un celular inválido.
  const { data: previos } = await supabase
    .from("whatsapp_envios")
    .select("id")
    .eq("turno_id", turno.turnoId)
    .eq("plantilla", PLANTILLA)
    .in("resultado", ["enviado", "error_twilio", "sin_celular"])
    .limit(1);
  if (previos && previos.length > 0) return false;

  const { data: medico } = await supabase
    .from("medicos")
    .select("nombre_completo, celular_personal")
    .eq("id", medicoId)
    .single();
  if (!medico) return false;

  const toE164 = normalizarTelefonoAR(medico.celular_personal);
  if (!toE164) {
    registrarEnvio({ medicoId, plantilla: PLANTILLA, resultado: "sin_celular", ctx });
    return false;
  }

  if (await esCuentaDePrueba({ medicoId })) {
    registrarEnvio({ medicoId, plantilla: PLANTILLA, resultado: "cuenta_test", ctx });
    return false;
  }

  const r = await enviarTwilioDetallado(toE164, contentSid, {
    "1": primerNombre(medico.nombre_completo),
    "2": turno.fecha,
    "3": turno.hora,
  });
  registrarEnvio({
    medicoId,
    plantilla: PLANTILLA,
    resultado: r.ok ? "enviado" : "error_twilio",
    ctx,
    twilioSid: r.sid,
    twilioErrorCode: r.errorCode,
  });
  return r.ok;
}

/** "hoy" / "mañana" / "sáb 5/10", en hora argentina, para los avisos de turno. */
export function fechaTurnoParaAviso(fechaISO: string, ahora: Date = new Date()): string {
  const hoy = ahora.toLocaleDateString("sv-SE", { timeZone: "America/Argentina/Buenos_Aires" });
  const manana = new Date(ahora.getTime() + 24 * 60 * 60 * 1000).toLocaleDateString("sv-SE", { timeZone: "America/Argentina/Buenos_Aires" });
  if (fechaISO === hoy) return "hoy";
  if (fechaISO === manana) return "mañana";
  const d = new Date(fechaISO + "T12:00:00-03:00");
  const dias = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
  return `${dias[d.getUTCDay()]} ${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
}
