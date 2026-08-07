"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { avisarCorreoEntrante, enviarDesdeBandeja, CORREO_SOPORTE } from "@/lib/correo";

// ─── Pedido de ayuda del usuario ─────────────────────────────────────────────
// Reemplaza al viejo `mailto:` del menú, que en un celular sin cliente de correo
// configurado NO HACE NADA (caso real: paciente con Outlook en iPhone que no
// pudo pedir ayuda por su receta). Acá el mensaje viaja por nuestro propio
// servidor y queda registrado en la tabla `correos`.
//
// Se guarda como correo de ENTRADA (`de` = email del usuario, `para` = soporte@):
//   - En la Bandeja aparece en "Recibidos", con chip SIN ATENDER y badge sin leer
//     (BandejaClient cuenta solo entradas — un registro en "Enviados" no avisa nada).
//   - El botón Responder contesta a `correo.de`, o sea AL USUARIO. Cuando el
//     pedido salía como correo de contacto@ a soporte@, la copia entrante quedaba
//     con `de = contacto@docto.com.ar` y responder era contestarse a uno mismo.
//   - Un solo mail por pedido (el aviso a Diego), no dos: la cuenta de Resend es
//     la MISMA que manda confirmaciones de cuenta y OTP de firma electrónica.
//
// Identidad: sale de la SESIÓN. Si no hay sesión, el usuario escribe un email
// de contacto. Nunca le pedimos datos que ya tenemos.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_MENSAJE = 5;
const MAX_MENSAJE = 4000;
const MAX_ASUNTO = 120;
const MAX_ORIGEN = 300;

/** Marca del asunto: sirve para contar los pedidos del formulario. */
const PREFIJO = "[Ayuda]";

// ─── Topes anti-abuso (ventana común de 10 minutos) ──────────────────────────
// El formulario es público y sin sesión: el email lo elige quien escribe. Un tope
// por email solo no alcanza (a1@x.com, a2@x.com… y listo), así que hay tres:
const VENTANA_MS = 10 * 60 * 1000;
const MAX_POR_IP = 5; // en memoria, corta la ráfaga del mismo origen
const MAX_POR_EMAIL = 5; // en DB, corta el reenvío del mismo usuario
const MAX_GLOBALES = 30; // en DB, válvula de emergencia ante ráfaga distribuida

// Mismo patrón que src/app/auth/registro-medico/actions.ts. Es por instancia de
// la función (serverless): no es una defensa perfecta, pero encarece muchísimo
// la ráfaga y el tope global de abajo cubre lo que se escape.
const porIp = new Map<string, { count: number; resetAt: number }>();

function limiteIpOk(ip: string): boolean {
  const ahora = Date.now();
  if (porIp.size > 5000) {
    for (const [k, v] of porIp) if (ahora > v.resetAt) porIp.delete(k);
  }
  const entrada = porIp.get(ip);
  if (!entrada || ahora > entrada.resetAt) {
    porIp.set(ip, { count: 1, resetAt: ahora + VENTANA_MS });
    return true;
  }
  if (entrada.count >= MAX_POR_IP) return false;
  entrada.count++;
  return true;
}

async function ipDelPedido(): Promise<string> {
  try {
    const h = await headers();
    return (
      h.get("x-real-ip")?.trim() ||
      h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      "desconocida"
    );
  } catch {
    return "desconocida";
  }
}

/** Sin caracteres de control: estos valores viajan al asunto de un correo. */
function limpiar(texto: string, max: number): string {
  const sinControles = Array.from(texto)
    .map((c) => (c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127 ? " " : c))
    .join("");
  return sinControles.replace(/\s+/g, " ").trim().slice(0, max);
}

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

  if (!limiteIpOk(await ipDelPedido())) {
    return {
      ok: false,
      error: `Ya recibimos tus mensajes y los estamos viendo. Si es urgente, escribinos a ${CORREO_SOPORTE}.`,
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

  const tope = await topeSuperado(email);
  if (tope === "email") {
    return {
      ok: false,
      error: `Ya recibimos tus mensajes y los estamos viendo. Si es urgente, escribinos a ${CORREO_SOPORTE}.`,
    };
  }
  if (tope === "global") {
    return {
      ok: false,
      error: `Estamos recibiendo muchos mensajes en este momento. Escribinos a ${CORREO_SOPORTE} y te contestamos.`,
    };
  }

  const tema = limpiar(params.asunto ?? "", MAX_ASUNTO);
  const origen = limpiar(params.origen ?? "", MAX_ORIGEN);

  const asunto = `${PREFIJO} ${tema || "Pedido de ayuda"} — ${email}`;
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

  // El registro en `correos` ES el mensaje: si la fila entra, el pedido no se
  // pierde aunque el aviso por mail falle (queda con chip SIN ATENDER).
  let correoId: string | null = null;
  try {
    const admin = createAdminClient();
    const { data: fila, error } = await admin
      .from("correos")
      .insert({
        direccion: "entrada",
        de: email,
        para: CORREO_SOPORTE,
        asunto,
        cuerpo_texto: cuerpo,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    correoId = fila?.id ? String(fila.id) : null;
  } catch (err) {
    console.error("[ayuda] no se pudo guardar el pedido:", err);
  }

  if (correoId) {
    // Aviso a Diego con link a la Bandeja. Best-effort por diseño: nunca rompe.
    await avisarCorreoEntrante(correoId, email, asunto);
    return { ok: true };
  }

  // Plan B (la DB no aceptó la fila): mandamos el pedido por correo a soporte@
  // para no perderlo. Solo se llega acá con la base caída.
  const r = await enviarDesdeBandeja({
    para: CORREO_SOPORTE,
    asunto,
    cuerpo,
    desde: "contacto",
    enviadoPor: userId,
  });
  if (r.ok) return { ok: true };

  console.error("[ayuda] tampoco se pudo enviar por mail:", r.error);
  return {
    ok: false,
    error: `No pudimos enviar tu mensaje. Probá de nuevo en un minuto o escribinos a ${CORREO_SOPORTE}.`,
  };
}

/**
 * ¿Se pasó de algún tope en la ventana? Cuenta pedidos del mismo email y del
 * formulario en general. Ante cualquier error: NO bloquea (devuelve null).
 */
async function topeSuperado(email: string): Promise<"email" | "global" | null> {
  try {
    const admin = createAdminClient();
    const desde = new Date(Date.now() - VENTANA_MS).toISOString();

    const base = () =>
      admin
        .from("correos")
        .select("id", { count: "exact", head: true })
        .eq("direccion", "entrada")
        .eq("para", CORREO_SOPORTE)
        .gte("creado_en", desde);

    const [delEmail, globales] = await Promise.all([
      base().eq("de", email),
      base().like("asunto", `${PREFIJO}%`),
    ]);

    if ((delEmail.count ?? 0) >= MAX_POR_EMAIL) return "email";
    if ((globales.count ?? 0) >= MAX_GLOBALES) return "global";
    return null;
  } catch {
    return null;
  }
}
