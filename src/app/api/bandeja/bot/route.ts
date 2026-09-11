import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enviarDesdeBandeja, type DireccionPropia } from "@/lib/correo";
import { logInfo, logWarn } from "@/lib/logger";
import { assertNoInstitucional } from "@/lib/instancia";

// ─── Acceso acotado a la Bandeja para un asistente externo ───────────────────
//
// POR QUÉ EXISTE (pedido de Diego, 11/09/2026): se quiere que un asistente
// externo lea los mails que entran a la bandeja y proponga respuestas, SIN
// darle acceso a la plataforma ni a la base de datos.
//
// Esta ruta es la única puerta. El asistente nunca ve `medicos`, `pacientes`,
// `consultas`, `turnos` ni nada que no esté acá: solo lo que estos tres verbos
// devuelven, que es la tabla `correos` y nada más.
//
// ── LOS TRES CANDADOS ───────────────────────────────────────────────────────
//
// 1. TOKEN PROPIO (`BANDEJA_BOT_TOKEN`). No se reusa CRON_SECRET ni ninguna
//    otra clave: si este token se filtra, se rota solo y no toca nada más.
//    Sin la variable seteada la ruta entera responde 404, como si no existiera.
//
// 2. NO PUEDE ESCRIBIRLE A CUALQUIERA. Solo puede responder a un correo que ya
//    existe en la bandeja, y la dirección de destino la resuelve el servidor
//    leyendo ese correo. El asistente no elige el destinatario: si lo manda, se
//    ignora. Así no puede usarse para mandar mail a nadie que no nos haya
//    escrito primero.
//
// 3. NO ENVÍA POR DEFECTO. `enviar: true` solo funciona si además está
//    `BANDEJA_BOT_ENVIO=on` en el entorno. Sin eso, la respuesta se devuelve
//    como borrador —exactamente lo que se mandaría— y no sale ningún mail.
//    Es el interruptor para entrenarlo sin riesgo y prenderlo cuando se confíe.
//
// ── LO QUE ESTA RUTA NO RESUELVE ────────────────────────────────────────────
// El contenido de estos mails incluye datos personales de pacientes y
// profesionales, y sale hacia un tercero. Eso exige que el proveedor esté
// declarado en la Política de Privacidad (art. 12 inc. a, Ley 25.326), igual
// que Didit. Ese requisito es legal, no técnico, y este archivo no lo cumple
// por sí solo.

export const dynamic = "force-dynamic";

/** Campos que el asistente puede ver. `cuerpo_html` queda afuera a propósito. */
const CAMPOS = "id, creado_en, direccion, de, para, asunto, cuerpo_texto, leido, atendido, en_respuesta_a, sistema";

/** Tope de mails por pedido, para que una sola llamada no se lleve la bandeja entera. */
const MAX_LISTA = 50;

function autorizado(req: NextRequest): boolean {
  const esperado = process.env.BANDEJA_BOT_TOKEN;
  if (!esperado) return false;
  const header = req.headers.get("authorization") ?? "";
  return header === `Bearer ${esperado}`;
}

/** Sin la variable seteada, la ruta no existe: ni siquiera admite que hay algo acá. */
function sinConfigurar(): boolean {
  return !process.env.BANDEJA_BOT_TOKEN;
}

// ── LEER ────────────────────────────────────────────────────────────────────
// GET ?accion=pendientes         → lo que entró y todavía nadie atendió
// GET ?accion=hilo&id=<uuid>     → un correo y todo su hilo
export async function GET(req: NextRequest) {
  if (!assertNoInstitucional() || sinConfigurar()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!autorizado(req)) {
    logWarn("[bandeja-bot]", "Intento no autorizado");
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const admin = createAdminClient();
  const accion = req.nextUrl.searchParams.get("accion") ?? "pendientes";

  if (accion === "pendientes") {
    // Solo lo que ENTRÓ, sin atender y que no sea un mail automático nuestro.
    const { data, error } = await admin
      .from("correos")
      .select(CAMPOS)
      .eq("direccion", "entrada")
      .eq("atendido", false)
      .or("sistema.is.null,sistema.eq.false")
      .order("creado_en", { ascending: false })
      .limit(MAX_LISTA);

    if (error) return NextResponse.json({ error: "No se pudo leer la bandeja" }, { status: 500 });
    logInfo("[bandeja-bot]", "Pendientes", { cantidad: (data ?? []).length });
    return NextResponse.json({ correos: data ?? [] });
  }

  if (accion === "hilo") {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Falta id" }, { status: 400 });

    const { data: correo } = await admin.from("correos").select(CAMPOS).eq("id", id).maybeSingle();
    if (!correo) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

    // El hilo: lo que se escribió en respuesta a este correo.
    const { data: respuestas } = await admin
      .from("correos")
      .select(CAMPOS)
      .eq("en_respuesta_a", id)
      .order("creado_en", { ascending: true });

    return NextResponse.json({ correo, respuestas: respuestas ?? [] });
  }

  return NextResponse.json({ error: "Acción desconocida" }, { status: 400 });
}

// ── RESPONDER ───────────────────────────────────────────────────────────────
// POST { correoId, cuerpo, asunto?, desde?, enviar? }
//
// `enviar` sin `BANDEJA_BOT_ENVIO=on` NO envía: devuelve el borrador.
export async function POST(req: NextRequest) {
  if (!assertNoInstitucional() || sinConfigurar()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!autorizado(req)) {
    logWarn("[bandeja-bot]", "Intento no autorizado (POST)");
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  let body: { correoId?: string; cuerpo?: string; asunto?: string; desde?: string; enviar?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const { correoId, cuerpo } = body;
  if (!correoId || !cuerpo?.trim()) {
    return NextResponse.json({ error: "Faltan correoId y cuerpo" }, { status: 400 });
  }

  const admin = createAdminClient();

  // El destinatario NO lo elige el asistente: sale del correo original. Es lo
  // que impide que esta ruta sirva para escribirle a cualquiera.
  const { data: original } = await admin
    .from("correos")
    .select("id, de, para, asunto, direccion")
    .eq("id", correoId)
    .maybeSingle();

  if (!original) return NextResponse.json({ error: "Correo no encontrado" }, { status: 404 });
  if (original.direccion !== "entrada") {
    return NextResponse.json({ error: "Solo se responde a un correo recibido" }, { status: 400 });
  }

  // `de` puede venir como "Nombre <mail@dominio>": se extrae la dirección.
  const destino = (original.de.match(/[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+/) ?? [])[0];
  if (!destino) {
    return NextResponse.json({ error: "El correo original no tiene remitente válido" }, { status: 422 });
  }

  const asunto = (body.asunto?.trim() || `Re: ${original.asunto ?? ""}`).slice(0, 200);
  const desde: DireccionPropia = body.desde === "soporte" ? "soporte" : "contacto";

  // El interruptor. Sin él, el asistente propone y no manda nada.
  const envioHabilitado = process.env.BANDEJA_BOT_ENVIO === "on";
  if (!body.enviar || !envioHabilitado) {
    logInfo("[bandeja-bot]", "Borrador propuesto", { correoId, pidioEnviar: Boolean(body.enviar), envioHabilitado });
    return NextResponse.json({
      enviado: false,
      motivo: body.enviar ? "El envío está apagado (BANDEJA_BOT_ENVIO)" : "No se pidió enviar",
      borrador: { para: destino, asunto, cuerpo, desde },
    });
  }

  const r = await enviarDesdeBandeja({
    para: destino,
    asunto,
    cuerpo,
    desde,
    enRespuestaA: correoId,
    // Queda registrado que lo escribió el asistente, no una persona.
    enviadoPor: null,
    adjuntos: [],
  });

  if (!r.ok) {
    logWarn("[bandeja-bot]", "Falló el envío", { correoId, error: r.error });
    return NextResponse.json({ enviado: false, error: r.error ?? "No se pudo enviar" }, { status: 502 });
  }

  // `enviarDesdeBandeja` ya marca el original como atendido al registrar la
  // salida con `enRespuestaA`. Repetirlo acá sería escribir dos veces lo mismo.
  logInfo("[bandeja-bot]", "Respuesta enviada", { correoId, desde });
  return NextResponse.json({ enviado: true, para: destino, asunto });
}
