"use server";

// Server actions del panel de la reunión (/admin/demo).
// SOLO instancia institucional: doble guard (flag + admin Docto) por action,
// mismo patrón que /admin/padron y /admin/operadores.
//
// ── EL QR SE ARMA ACÁ, EN EL SERVER ──────────────────────────────────────────
// El enlace lleva el token PELADO. Se genera, se convierte en PNG y se manda al
// cliente como data URI en la MISMA respuesta: no queda en ninguna URL de
// imagen, ni en un endpoint que alguien pueda pedir de nuevo, ni en los logs de
// acceso de la plataforma. En la base, como siempre, vive solo el sha256.

import { revalidatePath } from "next/cache";
import QRCode from "qrcode";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admin-auth";
import { esInstitucional } from "@/lib/instancia";
import { getConfigInstitucion } from "@/lib/institucional/config";
import { enviarTwilio, twilioConfigurado } from "@/lib/whatsapp";
import { getFlag } from "@/lib/feature-flags";
import { crearSesionDemo, type ParticipanteDemo } from "@/lib/institucional/demo";
import {
  invitarParticipante,
  regenerarEnlace,
  limpiarSesionDemo,
} from "@/lib/institucional/demo-invitacion";
import { prepararEscenario, rangoEscenarioPorDefecto } from "@/lib/institucional/demo-escenario";

async function guardAdminInstitucionalDocto(): Promise<string | null> {
  if (!esInstitucional()) return null; // en B2C estas actions no existen
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !(await isAdmin(user.id))) return null;
  return user.id;
}

/** Un QR grande y con harto margen de error: se escanea de una pared, en foto. */
async function qrDataUri(url: string): Promise<string> {
  return QRCode.toDataURL(url, {
    width: 520,
    margin: 1,
    errorCorrectionLevel: "M",
    color: { dark: "#111827", light: "#FFFFFF" },
  });
}

export interface EnlaceListo {
  participante: ParticipanteDemo;
  url: string;
  qr: string; // data URI
  /** Resultado del envío por WhatsApp, si se pidió. */
  whatsapp?: { ok: boolean; detalle: string };
}

export type RespuestaAccion =
  | { ok: true; enlace: EnlaceListo }
  | { ok: false; error: string };

// ─── Reuniones ───────────────────────────────────────────────────────────────

export async function nuevaReunion(
  nombre: string
): Promise<{ ok: boolean; error?: string; sesionId?: string }> {
  const uid = await guardAdminInstitucionalDocto();
  if (!uid) return { ok: false, error: "No autorizado" };

  const res = await crearSesionDemo({ nombre, adminUserId: uid });
  if (!res.ok) return { ok: false, error: res.error };

  revalidatePath("/admin/demo");
  return { ok: true, sesionId: res.sesion.id };
}

// ─── Participantes ───────────────────────────────────────────────────────────

export async function cargarParticipante(input: {
  sesionId: string;
  nombre: string;
  celular?: string;
  rol: string;
  titulo?: string;
  especialidad?: string;
  dni?: string;
  fecha_nacimiento?: string;
}): Promise<RespuestaAccion> {
  const uid = await guardAdminInstitucionalDocto();
  if (!uid) return { ok: false, error: "No autorizado" };

  const res = await invitarParticipante({
    sesionId: input.sesionId,
    raw: {
      nombre: input.nombre,
      celular: input.celular,
      rol: input.rol,
      dni: input.dni,
      fecha_nacimiento: input.fecha_nacimiento,
      especialidad: input.especialidad,
    },
    titulo: input.titulo,
  });
  if (!res.ok) return { ok: false, error: res.error };

  revalidatePath("/admin/demo");
  return {
    ok: true,
    enlace: {
      participante: res.invitacion.participante,
      url: res.invitacion.url,
      qr: await qrDataUri(res.invitacion.url),
    },
  };
}

/**
 * Vuelve a mostrar el QR de alguien que ya está cargado.
 *
 * Emite un enlace NUEVO y revoca el anterior, a propósito: es lo que hay que
 * hacer si el QR se escaneó desde el teléfono equivocado, y en el caso normal
 * (se cerró la pestaña) da exactamente lo mismo.
 */
export async function mostrarQR(participanteId: string): Promise<RespuestaAccion> {
  const uid = await guardAdminInstitucionalDocto();
  if (!uid) return { ok: false, error: "No autorizado" };

  const res = await regenerarEnlace(participanteId);
  if (!res.ok) return { ok: false, error: res.error };

  revalidatePath("/admin/demo");
  return {
    ok: true,
    enlace: {
      participante: res.invitacion.participante,
      url: res.invitacion.url,
      qr: await qrDataUri(res.invitacion.url),
    },
  };
}

/**
 * Manda el enlace por WhatsApp — el camino que NO controlamos.
 *
 * Depende de que Meta tenga aprobada la plantilla `demo_invitacion` en la
 * cuenta de la instancia (variables: 1 = institución, 2 = primer nombre,
 * 3 = enlace). Por eso el botón solo aparece cuando el SID está cargado en el
 * config, y por eso el QR existe: la demo no puede depender de Meta.
 *
 * Emite un enlace nuevo (y revoca el anterior) para no tener que hacer viajar
 * un token desde el navegador de vuelta al server.
 */
export async function enviarPorWhatsApp(participanteId: string): Promise<RespuestaAccion> {
  const uid = await guardAdminInstitucionalDocto();
  if (!uid) return { ok: false, error: "No autorizado" };

  const config = await getConfigInstitucion();
  const sid = config.wa_plantillas?.demo_invitacion;
  if (!sid) {
    return { ok: false, error: "No hay plantilla de WhatsApp aprobada para la invitación. Usá el QR." };
  }
  const canalVivo = (await getFlag("whatsapp_institucional").catch(() => false)) && twilioConfigurado();
  if (!canalVivo) {
    return { ok: false, error: "El canal de WhatsApp está apagado en esta instancia. Usá el QR." };
  }

  const res = await regenerarEnlace(participanteId);
  if (!res.ok) return { ok: false, error: res.error };
  const { participante, url } = res.invitacion;

  if (!participante.celular) {
    return { ok: false, error: "Ese participante no tiene celular cargado. Usá el QR." };
  }

  const enviado = await enviarTwilio(participante.celular, sid, {
    "1": config.nombre,
    "2": participante.nombre.trim().split(/\s+/)[0] ?? "",
    "3": url,
  });

  revalidatePath("/admin/demo");
  return {
    ok: true,
    enlace: {
      participante,
      url,
      qr: await qrDataUri(url),
      whatsapp: {
        ok: enviado,
        detalle: enviado
          ? "Se lo mandamos por WhatsApp."
          : "WhatsApp no salió. Mostrale el QR.",
      },
    },
  };
}

// ─── Limpiar ─────────────────────────────────────────────────────────────────

export async function limpiarReunion(sesionId: string): Promise<{
  ok: boolean;
  error?: string;
  problemas?: string[];
  /** Lo que la evidencia de firma retuvo y quedó anonimizado. No es una falla. */
  retenidos?: string[];
  participantes?: number;
}> {
  const uid = await guardAdminInstitucionalDocto();
  if (!uid) return { ok: false, error: "No autorizado" };

  const res = await limpiarSesionDemo(sesionId);
  revalidatePath("/admin/demo");
  if (!res.ok) {
    return {
      ok: false,
      error:
        "Quedaron cosas sin borrar y la reunión NO se cerró: el botón sigue disponible para " +
        "reintentar. El detalle está abajo.",
      problemas: res.problemas,
      retenidos: res.retenidos,
      participantes: res.participantes,
    };
  }
  return { ok: true, participantes: res.participantes, retenidos: res.retenidos };
}

// ─── El escenario ────────────────────────────────────────────────────────────

/**
 * Deja la agenda del profesional lista para el guion: turnos acordados del 20
 * al 30 de agosto, una franja de HOY para que el call center pueda asignar
 * "para ahora", y unos pocos pacientes de utilería sentados para que la grilla
 * no se proyecte vacía.
 *
 * Se corre después de invitarlo y antes de que empiece la reunión. Volver a
 * correrlo no duplica nada.
 */
export async function prepararEscenarioDemo(input: {
  sesionId: string;
  medicoId: string;
  desde?: string;
  hasta?: string;
}): Promise<{ ok: boolean; error?: string; resumen?: string; notas?: string[] }> {
  const uid = await guardAdminInstitucionalDocto();
  if (!uid) return { ok: false, error: "No autorizado" };

  const res = await prepararEscenario({
    medicoId: input.medicoId,
    sesionId: input.sesionId,
    desde: input.desde,
    hasta: input.hasta,
  });

  revalidatePath("/admin/demo");
  const resumen = `${res.turnosCreados} turnos creados · ${res.turnosOcupados} ya ocupados por pacientes de utilería.`;
  if (!res.ok) {
    return { ok: false, error: "No se pudo dejar la agenda lista.", notas: res.notas };
  }
  return { ok: true, resumen, notas: res.notas };
}

/** El rango que la pantalla muestra por defecto (el del guion, sin fechas viejas). */
export async function rangoSugerido(): Promise<{ desde: string; hasta: string }> {
  return rangoEscenarioPorDefecto();
}
