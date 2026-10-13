import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { VERSION_CONSENTIMIENTO_MEDICO, esVersionConsentimientoValida } from "@/lib/legal/consentimiento-version";
import { versionConsentimientoDelTurno } from "@/lib/legal/consentimiento-turno";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const body = await req.json();
  const { consultaId, turnoId, textoVersion } = body;

  if (!consultaId && !turnoId) {
    return NextResponse.json({ error: "Falta consultaId o turnoId" }, { status: 400 });
  }

  if (consultaId) {
    const { data: consulta } = await supabase
      .from("consultas")
      .select("paciente_id")
      .eq("id", consultaId)
      .single();

    if (!consulta || consulta.paciente_id !== user.id) {
      return NextResponse.json({ error: "Consulta no encontrada" }, { status: 403 });
    }
  }

  // La versión del texto la decide el servidor según la profesión del
  // profesional de la atención (13/10/2026): el registro es la prueba de QUÉ
  // texto aceptó el paciente y no puede depender de lo que mande el cliente.
  // La consulta inmediata es siempre de un médico.
  let version: string = VERSION_CONSENTIMIENTO_MEDICO;

  if (turnoId) {
    // La misma lectura que la página que muestra el texto (versionConsentimientoDelTurno).
    const { data: paciente } = await supabase.from("pacientes").select("id").eq("user_id", user.id).maybeSingle();
    const delTurno = paciente
      ? await versionConsentimientoDelTurno(createAdminClient(), turnoId, paciente.id)
      : ({ ok: false, motivo: "no_es_suyo" } as const);
    if (!delTurno.ok) {
      return delTurno.motivo === "no_es_suyo"
        ? NextResponse.json({ error: "Turno no encontrado" }, { status: 403 })
        : NextResponse.json({ error: "No se pudo leer el turno", recargar: true }, { status: 503 });
    }
    version = delTurno.version;
  }

  // El cliente dice qué versión mostró: tiene que ser la misma que la del
  // servidor; si no, el registro mentiría. 409 + recargar: la pantalla vuelve a
  // pedir el texto vigente en vez de quedar trabada.
  if (textoVersion != null && (!esVersionConsentimientoValida(textoVersion) || textoVersion !== version)) {
    return NextResponse.json({ error: "La versión del texto no coincide", recargar: true }, { status: 409 });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const userAgent = req.headers.get("user-agent") ?? null;

  const { error } = await supabase.from("consentimientos_informados").insert({
    paciente_id: user.id,
    consulta_id: consultaId ?? null,
    turno_id: turnoId ?? null,
    texto_version: version,
    ip,
    user_agent: userAgent,
  });

  if (error) {
    console.error("[consentimiento] insert error:", error.code, error.message);
    return NextResponse.json({ error: "Error registrando consentimiento" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
