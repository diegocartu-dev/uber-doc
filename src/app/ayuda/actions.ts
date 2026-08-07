"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enviarDesdeBandeja, CORREO_SOPORTE } from "@/lib/correo";

// ─── Pedido de ayuda del usuario ─────────────────────────────────────────────
// Reemplaza al viejo `mailto:` del menú, que en un celular sin cliente de correo
// configurado NO HACE NADA (caso real: paciente con Outlook en iPhone que no
// pudo pedir ayuda por su receta). Acá el mensaje viaja por nuestro propio
// servidor: sale como correo a soporte@docto.com.ar y queda registrado en la
// tabla `correos` (Bandeja del panel admin), igual que el resto del correo.
//
// Identidad: sale de la SESIÓN. Si no hay sesión, el usuario escribe un email
// de contacto. Nunca le pedimos datos que ya tenemos.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_MENSAJE = 5;
const MAX_MENSAJE = 4000;
const MAX_ASUNTO = 120;
const MAX_ORIGEN = 300;

/** Tope suave anti-spam: 5 pedidos por email cada 10 minutos. */
const VENTANA_MS = 10 * 60 * 1000;
const MAX_EN_VENTANA = 5;

export type ResultadoAyuda = { ok: boolean; error?: string };

export async function enviarPedidoAyuda(params: {
  mensaje: string;
  asunto?: string;
  emailContacto?: string;
  origen?: string;
}): Promise<ResultadoAyuda> {
  const mensaje = (params.mensaje ?? "").trim();
  if (mensaje.length < MIN_MENSAJE) {
    return { ok: false, error: "Contanos un poco más para poder ayudarte." };
  }
  if (mensaje.length > MAX_MENSAJE) {
    return {
      ok: false,
      error: "El mensaje es muy largo. Contanos lo esencial y seguimos por mail.",
    };
  }

  // La sesión nunca puede bloquear el pedido: si falla, seguimos como anónimo.
  let userId: string | null = null;
  let emailSesion = "";
  let nombreSesion = "";
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      userId = user.id;
      emailSesion = (user.email ?? "").trim();
      const meta = user.user_metadata as { full_name?: string } | null;
      nombreSesion = (meta?.full_name ?? "").trim();
    }
  } catch {
    // sesión rota / cookies raras → tratamos el pedido como anónimo
  }

  const email = emailSesion || (params.emailContacto ?? "").trim();
  if (!EMAIL_RE.test(email)) {
    return {
      ok: false,
      error: "Necesitamos tu email para responderte. Revisá que esté bien escrito.",
    };
  }

  if (await superaElTope(email)) {
    return {
      ok: false,
      error: `Ya recibimos tus mensajes y los estamos viendo. Si es urgente, escribinos a ${CORREO_SOPORTE}.`,
    };
  }

  const tema = (params.asunto ?? "").trim().slice(0, MAX_ASUNTO);
  const origen = (params.origen ?? "").trim().slice(0, MAX_ORIGEN);

  const asunto = `[Ayuda] ${tema || "Pedido de ayuda"} — ${email}`;
  const cuerpo = [
    mensaje,
    "",
    "———",
    "Enviado desde el formulario de ayuda de docto.com.ar",
    `Responder a: ${email}`,
    nombreSesion ? `Nombre: ${nombreSesion}` : null,
    userId ? `Usuario: ${userId}` : "Sin sesión iniciada",
    origen ? `Venía de: ${origen}` : null,
  ]
    .filter((l): l is string => l !== null)
    .join("\n");

  // `enviarDesdeBandeja` guarda la fila en `correos` SIEMPRE, incluso si Resend
  // falla (queda con error_envio) — el mensaje del usuario no se pierde nunca.
  const r = await enviarDesdeBandeja({
    para: CORREO_SOPORTE,
    asunto,
    cuerpo,
    desde: "contacto",
    enviadoPor: userId,
  });

  if (!r.ok) {
    console.error("[ayuda] no se pudo enviar el pedido:", r.error);
    return {
      ok: false,
      error: `No pudimos enviar tu mensaje. Probá de nuevo en un minuto o escribinos a ${CORREO_SOPORTE}.`,
    };
  }

  return { ok: true };
}

/** Cuenta pedidos recientes del mismo email. Ante cualquier error: NO bloquea. */
async function superaElTope(email: string): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const desde = new Date(Date.now() - VENTANA_MS).toISOString();
    const { count } = await admin
      .from("correos")
      .select("id", { count: "exact", head: true })
      .eq("direccion", "salida")
      .eq("para", CORREO_SOPORTE)
      .gte("creado_en", desde)
      .ilike("asunto", `[Ayuda]%${email}`);
    return (count ?? 0) >= MAX_EN_VENTANA;
  } catch {
    return false;
  }
}
