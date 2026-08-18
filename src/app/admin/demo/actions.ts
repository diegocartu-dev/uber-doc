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
  enlaceDelParticipante,
  invitarParticipante,
  limpiarSesionDemo,
} from "@/lib/institucional/demo-invitacion";
import { prepararEscenario, rangoEscenarioPorDefecto } from "@/lib/institucional/demo-escenario";
import { reintentarClavesDemo } from "@/lib/institucional/demo-profesional";

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
  /** `false` = el alta no pudo dejarle claves de firma (se avisa en la pantalla). */
  firmaLista?: boolean;
  /** La agenda quedó armada con el alta. `false` = hay que reintentarla. */
  agendaLista?: boolean;
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
      firmaLista: res.invitacion.firmaLista,
      agendaLista: res.invitacion.agendaLista,
    },
  };
}

/**
 * EMITE UN ENLACE NUEVO para alguien que ya está cargado. No es "volver a
 * mostrar el QR": revoca el anterior y CIERRA LA SESIÓN que ese anterior haya
 * minteado, así que si el participante ya entró, lo deja afuera en el acto.
 *
 * Es lo correcto cuando el QR se escaneó desde el teléfono equivocado — y era
 * exactamente lo incorrecto atado al botón "Ver QR", que es lo que Diego toca
 * para mostrarle a la audiencia cómo se hace. En la pantalla ahora son dos
 * botones distintos y este cuelga del rotulado "Regenerar", con confirmación
 * cuando el participante está adentro.
 *
 * No existe un camino de "mostrar el vigente" del lado del server, y no puede
 * existir: en la base vive solo el sha256 del token. El enlace pelado se ve UNA
 * vez, en la respuesta que lo creó — la pantalla lo recuerda para volver a
 * proyectarlo sin emitir nada.
 */
export async function mostrarQR(participanteId: string): Promise<RespuestaAccion> {
  const uid = await guardAdminInstitucionalDocto();
  if (!uid) return { ok: false, error: "No autorizado" };

  // Mostrar el QR es una LECTURA: devuelve el enlace que ya tiene. Antes esto
  // regeneraba, y regenerar echa a quien ya entró.
  const res = await enlaceDelParticipante(participanteId);
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

  // Le manda el MISMO enlace que muestra el QR: mandar por WhatsApp no puede
  // dejar afuera a quien ya escaneó.
  const res = await enlaceDelParticipante(participanteId);
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

/**
 * Reintenta las claves de firma de un profesional de la reunión.
 *
 * El botón que faltaba: sin claves, la Escena 4 (receta firmada + QR de
 * verificación funcionando) muestra un documento sin sello y la página pública
 * en ámbar. Antes el fallo solo vivía en los logs de Vercel.
 */
export async function reintentarFirma(
  medicoId: string
): Promise<{ ok: boolean; error?: string }> {
  const uid = await guardAdminInstitucionalDocto();
  if (!uid) return { ok: false, error: "No autorizado" };

  const res = await reintentarClavesDemo(medicoId);
  revalidatePath("/admin/demo");
  return res;
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
 * Deja la agenda del profesional lista para el guion: turnos acordados desde hoy
 * hasta el 30 de agosto en UNA sola mitad del día —la otra queda libre para que
 * Nova tenga dónde crear—, una franja de HOY para que el call center pueda
 * asignar "para ahora", y unos pocos pacientes de utilería sentados para que la
 * grilla no se proyecte vacía.
 *
 * Se corre después de invitarlo y antes de que empiece la reunión. Volver a
 * correrlo no duplica nada: ni la agenda, ni los pacientes de utilería, ni el
 * profesional de respaldo.
 */
export async function prepararEscenarioDemo(input: {
  sesionId: string;
  medicoId: string;
  desde?: string;
  hasta?: string;
}): Promise<{
  ok: boolean;
  error?: string;
  resumen?: string;
  notas?: string[];
  /** Lo que va a fallar EN VIVO si nadie lo mira. La pantalla lo pinta en rojo. */
  alertas?: string[];
}> {
  const uid = await guardAdminInstitucionalDocto();
  if (!uid) return { ok: false, error: "No autorizado" };

  const res = await prepararEscenario({
    medicoId: input.medicoId,
    sesionId: input.sesionId,
    desde: input.desde,
    hasta: input.hasta,
  });

  revalidatePath("/admin/demo");
  const resumen =
    `${res.turnosCreados} turnos creados · ${res.turnosOcupados} ya ocupados por pacientes de utilería` +
    (res.respaldoCreado ? " · profesional de respaldo listo (para la escena de reprogramar)." : ".");
  if (!res.ok) {
    return {
      ok: false,
      error: "No se pudo dejar la agenda lista.",
      notas: res.notas,
      alertas: res.alertas,
    };
  }
  return { ok: true, resumen, notas: res.notas, alertas: res.alertas };
}

/** El rango que la pantalla muestra por defecto (el del guion, sin fechas viejas). */
export async function rangoSugerido(): Promise<{ desde: string; hasta: string }> {
  return rangoEscenarioPorDefecto();
}
