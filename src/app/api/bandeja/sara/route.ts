import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { validarContactoSara, asuntoSara, cuerpoSara } from "@/lib/bandeja/sara";
import { logInfo, logWarn, logError } from "@/lib/logger";
import { assertNoInstitucional } from "@/lib/instancia";

// ─── La puerta de Sara a la Bandeja ──────────────────────────────────────────
//
// POR QUÉ EXISTE (pedido de AC Ai, decidido por Diego 12/10/2026): Sara, la
// secretaria de pacientes que atiende AC Ai, deja acá los contactos que tiene
// que seguir una persona —una institución interesada, un profesional que el
// registro todavía no admite—. Aparecen en la pestaña "Sara" de la Bandeja,
// separada de soporte. Diego: "claramente no sería un mail".
//
// Es una puerta de UN solo verbo: escribir un contacto. No lee la bandeja, no
// manda mails, no devuelve nada de nadie. Lo que entra lo valida
// `validarContactoSara` (lib/bandeja/sara.ts), que además descarta todo campo
// que no esté en el contrato.
//
// ── LA CLAVE ────────────────────────────────────────────────────────────────
// `Authorization: Bearer <clave>`. En la base vive SOLO el sha256 de la clave
// (`claves_externas.key_hash`), el mismo modelo que el operador IA de la
// instancia (lib/otorgador/auth.ts). La clave pelada se entrega una vez y no se
// recupera; rotarla es insertar otra y apagar la vieja. Un error de base no
// regala acceso: responde 401 igual que una clave mala.
//
// ── EL ASISTENTE DE LA BANDEJA NO LO VE ─────────────────────────────────────
// Lo que entra por acá lo escribió cualquier persona a través de un modelo. La
// puerta de Grokbot (api/bandeja/bot) filtra `origen = 'correo'` en los cuatro
// verbos: un texto de Sara nunca llega a otro modelo que puede mandar mails.

export const dynamic = "force-dynamic";

/** Un contacto pesa unos cientos de bytes. Algo más grande es una falla, no un caso de uso. */
const MAX_BYTES = 8 * 1024;

async function claveValida(req: NextRequest): Promise<boolean> {
  const header = req.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) return false;
  const clave = header.slice("Bearer ".length).trim();
  if (!clave) return false;

  const hash = createHash("sha256").update(clave, "utf8").digest("hex");
  const { data, error } = await createAdminClient()
    .from("claves_externas")
    .select("id")
    .eq("key_hash", hash)
    .eq("quien", "sara")
    .eq("activa", true)
    .limit(1)
    .maybeSingle();
  if (error) {
    // Fail-closed: una falla de base no se convierte en acceso.
    logError("[bandeja-sara]", "No se pudo verificar la clave", { error: error.message });
    return false;
  }
  return !!data;
}

export async function POST(req: NextRequest) {
  // En la instancia institucional esta puerta no existe.
  if (!assertNoInstitucional()) {
    return NextResponse.json({ ok: false, error: "No existe." }, { status: 404 });
  }
  if (!(await claveValida(req))) {
    logWarn("[bandeja-sara]", "Intento no autorizado");
    return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 401 });
  }

  const crudo = await req.text();
  if (crudo.length > MAX_BYTES) {
    return NextResponse.json({ ok: false, error: "El contacto es demasiado grande." }, { status: 413 });
  }
  let cuerpo: unknown;
  try {
    cuerpo = JSON.parse(crudo);
  } catch {
    return NextResponse.json({ ok: false, error: "El cuerpo no es JSON válido." }, { status: 400 });
  }

  const r = validarContactoSara(cuerpo);
  if (!r.ok) {
    // El motivo vuelve tal cual: es lo que Sara necesita para volver a preguntar.
    return NextResponse.json({ ok: false, error: r.error }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("correos")
    .insert({
      direccion: "entrada",
      origen: "sara",
      de: "Sara",
      asunto: asuntoSara(r.contacto),
      cuerpo_texto: cuerpoSara(r.contacto),
      datos: r.contacto,
      id_externo: r.idExterno,
    })
    .select("id")
    .single();

  if (error) {
    // Sara reintentó un contacto que ya estaba: no es un error, ya lo tenemos.
    if (error.code === "23505" && r.idExterno) {
      const { data: previo } = await admin
        .from("correos")
        .select("id")
        .eq("origen", "sara")
        .eq("id_externo", r.idExterno)
        .maybeSingle();
      if (previo) return NextResponse.json({ ok: true, id: previo.id, repetido: true });
    }
    logError("[bandeja-sara]", "No se pudo guardar el contacto", { error: error.message });
    return NextResponse.json({ ok: false, error: "No se pudo guardar el contacto. Probá de nuevo en un rato." }, { status: 500 });
  }

  // Sin datos personales en el log: solo qué tipo de contacto llegó.
  logInfo("[bandeja-sara]", "Contacto recibido", { id: data.id, tipo: r.contacto.tipo });
  return NextResponse.json({ ok: true, id: data.id });
}
