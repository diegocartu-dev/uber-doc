import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { guardarDestino } from "@/lib/pagos/destinos";
import { normalizarDestinoDeclarado, etiquetaDestino } from "@/lib/pagos/destinos-puro";
import { assertNoInstitucional } from "@/lib/instancia";

/**
 * El paciente declara a dónde se le devuelve la plata si algo se cancela
 * (alias o CVU/CBU). Se pide al primer pago, en "Tu información médica", con el
 * aviso "en caso de cancelación, el reintegro se hará a esta cuenta"
 * (Diego, 30/09/2026). Nunca es bloqueante: si no lo carga, sigue igual.
 *
 * La validación vive en lib/pagos/destinos-puro.ts; la escritura, en
 * lib/pagos/destinos.ts con service role (la tabla no admite escrituras del
 * cliente). Un cambio de destino espera 24 h antes de poder usarse.
 */
export async function POST(req: NextRequest) {
  // Modo institucional: nadie pagó, no hay reintegros — este endpoint no existe (Capa B).
  if (!assertNoInstitucional()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  let body: { valor?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Escribí un alias o un CVU/CBU." }, { status: 400 });
  }
  const normalizado = normalizarDestinoDeclarado(typeof body.valor === "string" ? body.valor : "");
  if (!normalizado.ok) return NextResponse.json({ error: normalizado.error }, { status: 400 });

  // Solo pacientes: un profesional con Mercado Pago conectado ya tiene su destino
  // por OAuth, y el que no lo tiene entra por otro camino (plantel, Sprint 4).
  const { data: paciente } = await supabase.from("pacientes").select("id").eq("user_id", user.id).maybeSingle();
  if (!paciente) return NextResponse.json({ error: "Paciente no encontrado." }, { status: 404 });

  const guardado = await guardarDestino({
    userId: user.id,
    rol: "paciente",
    tipo: normalizado.destino.tipo,
    valor: normalizado.destino.valor,
    origen: "declarado",
  });
  if (!guardado.ok) return NextResponse.json({ error: guardado.error }, { status: 500 });

  return NextResponse.json({
    ok: true,
    tipo: guardado.destino.tipo,
    valor: guardado.destino.valor,
    etiqueta: etiquetaDestino(guardado.destino),
    usable_desde: guardado.destino.usable_desde,
    cambio: guardado.cambio,
  });
}
