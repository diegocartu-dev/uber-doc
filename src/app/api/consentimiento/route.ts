import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { profesionDeLaFicha } from "@/lib/medicos/profesion-ficha";
import {
  VERSION_CONSENTIMIENTO_MEDICO,
  esVersionConsentimientoValida,
  versionConsentimiento,
} from "@/lib/legal/consentimiento-version";

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
    // `turnos.paciente_id` es `pacientes.id`, no el user_id (asimetría de esquema).
    // Comparar contra user.id dejaba sin registrar todo consentimiento de turno.
    const [{ data: turno }, { data: paciente }] = await Promise.all([
      supabase.from("turnos").select("paciente_id, medico_id").eq("id", turnoId).single(),
      supabase.from("pacientes").select("id").eq("user_id", user.id).maybeSingle(),
    ]);

    if (!turno || !paciente || turno.paciente_id !== paciente.id) {
      return NextResponse.json({ error: "Turno no encontrado" }, { status: 403 });
    }
    if (turno.medico_id) {
      version = versionConsentimiento(await profesionDeLaFicha(createAdminClient(), { medicoId: turno.medico_id }));
    }
  }

  // Si el cliente dice qué versión mostró, tiene que ser la misma que la del
  // servidor; si no, el registro mentiría.
  if (textoVersion != null && (!esVersionConsentimientoValida(textoVersion) || textoVersion !== version)) {
    return NextResponse.json({ error: "La versión del texto no coincide" }, { status: 400 });
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
