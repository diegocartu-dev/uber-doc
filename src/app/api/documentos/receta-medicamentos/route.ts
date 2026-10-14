import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizarMedicamentos } from "@/lib/recetas/medicamentos";
import { listaCoincideConReceta } from "@/lib/recetas/serializar";
import { esControlado } from "@/data/controlados";

// Guarda la receta estructurada (lista de medicamentos con cantidad de envases)
// en la receta que el profesional ACABA de emitir (13/10/2026). La necesita el
// registro de la receta en Farmalink (docs/farmalink-integracion.md).
//
// Solo suma: el navegador la llama sin esperar respuesta, DESPUÉS de que la
// receta ya se guardó, y si esto falla la receta queda igual que siempre (texto,
// PDF y firma salen de `contenido`, que acá no se toca). Escribe solo una
// receta de este profesional, de esta atención, reciente y sin lista guardada,
// y solo si la lista es exactamente la receta guardada (lo que dice el texto
// firmado manda: una lista que no coincide no se guarda).

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Misma idea que la ventana de la firma: lo recién emitido, no lo histórico.
const VENTANA_MS = 30 * 60 * 1000;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 });

  let body: { consultaId?: unknown; tipo?: unknown; medicamentos?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 });
  }
  const atencionId = typeof body.consultaId === "string" ? body.consultaId : "";
  // Como en /api/documentos/firmar: sin `tipo`, es una consulta inmediata.
  const esTurno = body.tipo === "turno";
  if (!UUID_RE.test(atencionId) || (body.tipo != null && body.tipo !== "turno" && body.tipo !== "consulta")) {
    return NextResponse.json({ ok: false, error: "Atención inválida" }, { status: 400 });
  }
  const normalizada = normalizarMedicamentos(body.medicamentos);
  if (!normalizada.ok) return NextResponse.json({ ok: false, error: normalizada.error }, { status: 400 });
  // Misma regla que el borrador: por Docto no se recetan controlados.
  if (normalizada.medicamentos.some((m) => esControlado(m.droga || m.nombre))) {
    return NextResponse.json({ ok: false, error: "Controlado" }, { status: 422 });
  }

  const admin = createAdminClient();
  const { data: medico, error: errorMedico } = await admin
    .from("medicos")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (errorMedico) return NextResponse.json({ ok: false, error: "No se pudo leer el profesional" }, { status: 500 });
  if (!medico) return NextResponse.json({ ok: false, error: "No es profesional" }, { status: 403 });

  const desde = new Date(Date.now() - VENTANA_MS).toISOString();
  const { data: receta, error: errorReceta } = await admin
    .from("documentos")
    .select("id, contenido")
    .eq(esTurno ? "turno_id" : "consulta_id", atencionId)
    .eq("medico_id", medico.id)
    .eq("tipo", "receta")
    .is("medicamentos", null)
    .gte("created_at", desde)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (errorReceta) {
    console.error("[receta-medicamentos] no se pudo leer la receta:", errorReceta.message);
    return NextResponse.json({ ok: false, error: "No se pudo leer la receta" }, { status: 500 });
  }
  if (!receta) return NextResponse.json({ ok: false, error: "No hay receta reciente sin lista" }, { status: 404 });
  if (!listaCoincideConReceta(normalizada.medicamentos, receta.contenido ?? "")) {
    return NextResponse.json({ ok: false, error: "La lista no coincide con la receta guardada" }, { status: 409 });
  }

  const { error: errorUpdate } = await admin
    .from("documentos")
    .update({ medicamentos: normalizada.medicamentos })
    .eq("id", receta.id)
    .is("medicamentos", null);
  if (errorUpdate) {
    console.error("[receta-medicamentos] no se pudo guardar la lista:", errorUpdate.message);
    return NextResponse.json({ ok: false, error: "No se pudo guardar" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
