import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/admin";

// ─── Bandeja de correo del panel admin (spec Diego 30/07) ────────────────────
// Canal de contacto/prospección: envía como contacto@docto.com.ar y registra
// TODO en la tabla `correos` — la Bandeja es el registro, no solo un botón.
// El aviso de correo entrante va al mail personal de Diego con link al panel.

export const CORREO_CONTACTO = "contacto@docto.com.ar";
export const CORREO_SOPORTE = "soporte@docto.com.ar";
export type DireccionPropia = "contacto" | "soporte";
export const DIRECCIONES: Record<DireccionPropia, string> = {
  contacto: CORREO_CONTACTO,
  soporte: CORREO_SOPORTE,
};

/** A cuál de nuestras direcciones llegó un mail (para el chip y el responder-desde). */
export function direccionPropiaDe(para: string | null): DireccionPropia {
  return (para ?? "").toLowerCase().includes("soporte@") ? "soporte" : "contacto";
}
const AVISO_A = "diegocartu@gmail.com";
const BASE_URL = "https://docto.com.ar";

const FIRMA = "\n\n—\nDocto\ndocto.com.ar";

let _resend: Resend | null = null;
function resend(): Resend {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

// Texto plano → HTML mínimo y seguro (escapado + saltos de línea).
function textoAHtml(texto: string): string {
  const esc = texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<div style="font-family: Inter, -apple-system, sans-serif; font-size: 15px; line-height: 1.6; color: #1f2937; white-space: pre-wrap;">${esc}</div>`;
}

/**
 * Envía un correo desde la Bandeja y lo registra SIEMPRE en `correos`
 * (dirección 'salida'), incluso si el envío falla (error_envio con el motivo).
 * Si es respuesta (enRespuestaA), marca el original como atendido.
 */
/**
 * Adjunto que sale con una respuesta de la Bandeja. `contenidoBase64` viaja
 * desde el navegador YA COMPRIMIDO (regla de la casa: comprimirImagen antes de
 * cualquier tope de peso — el límite de body de Vercel son ~4,5 MB y un
 * screenshot crudo de iPhone lo roza).
 */
export type AdjuntoSalida = {
  nombre: string;
  tipo: string;
  contenidoBase64: string;
};

export async function enviarDesdeBandeja(params: {
  para: string;
  asunto: string;
  cuerpo: string;
  desde?: DireccionPropia;
  enRespuestaA?: string | null;
  enviadoPor?: string | null;
  adjuntos?: AdjuntoSalida[];
}): Promise<{ ok: boolean; error?: string }> {
  const admin = createAdminClient();
  const direccionDe = DIRECCIONES[params.desde ?? "contacto"];
  const cuerpoFinal = params.cuerpo.trimEnd() + FIRMA;
  const adjuntos = params.adjuntos ?? [];

  let resendId: string | null = null;
  let errorEnvio: string | null = null;
  try {
    const { data, error } = await resend().emails.send({
      from: `Docto <${direccionDe}>`,
      to: [params.para],
      replyTo: direccionDe,
      subject: params.asunto,
      text: cuerpoFinal,
      html: textoAHtml(cuerpoFinal),
      ...(adjuntos.length > 0
        ? { attachments: adjuntos.map((a) => ({ filename: a.nombre, content: a.contenidoBase64 })) }
        : {}),
    });
    if (error) errorEnvio = error.message ?? String(error);
    else resendId = data?.id ?? null;
  } catch (err) {
    errorEnvio = err instanceof Error ? err.message : String(err);
  }

  await admin.from("correos").insert({
    direccion: "salida",
    de: direccionDe,
    para: params.para,
    asunto: params.asunto,
    cuerpo_texto: cuerpoFinal,
    // Mismo shape que los adjuntos ENTRANTES (`filename`), para que la ficha los
    // liste igual sin importar la dirección. El archivo vive en el mail enviado.
    adjuntos: adjuntos.map((a) => ({ filename: a.nombre, tipo: a.tipo })),
    en_respuesta_a: params.enRespuestaA ?? null,
    resend_id: resendId,
    enviado_por: params.enviadoPor ?? null,
    error_envio: errorEnvio,
  });

  if (!errorEnvio && params.enRespuestaA) {
    await admin.from("correos").update({ atendido: true }).eq("id", params.enRespuestaA);
  }

  return errorEnvio ? { ok: false, error: errorEnvio } : { ok: true };
}

/** Aviso best-effort a Diego de que llegó un correo nuevo, con link a la Bandeja. */
export async function avisarCorreoEntrante(correoId: string, de: string, asunto: string): Promise<void> {
  try {
    await resend().emails.send({
      from: "Docto Bandeja <no-reply@docto.com.ar>",
      to: [AVISO_A],
      subject: `📬 Correo nuevo de ${de}`,
      text: [
        `Llegó un correo a la Bandeja de Docto:`,
        "",
        `De: ${de}`,
        `Asunto: ${asunto || "(sin asunto)"}`,
        "",
        `Leelo y respondelo desde la Bandeja:`,
        `${BASE_URL}/admin/bandeja/${correoId}`,
        "",
        "No respondas este mail — usá la Bandeja del panel.",
      ].join("\n"),
    });
  } catch {
    // best-effort: el correo ya está guardado, el aviso nunca rompe el webhook
  }
}
