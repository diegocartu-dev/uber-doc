// GET /api/otorgador/oferta?especialidad= — la oferta PRIORIZADA (spec
// institucional §4.3-§4.4; shape 04-spec §1.4). La pantalla pinta, la API
// ordena: acá no hay sort() posible del lado del cliente porque el orden que
// llega ES el orden. SOLO instancia institucional; operador por sesión o API
// key (un operador IA ve literalmente lo mismo que el humano).

import { NextRequest, NextResponse } from "next/server";
import { identificarOperador } from "@/lib/otorgador/auth";
import { armarOferta } from "@/lib/otorgador/oferta";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const identidad = await identificarOperador(req);
  if (!identidad) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const especialidad = (req.nextUrl.searchParams.get("especialidad") ?? "").trim();
  if (!especialidad) {
    return NextResponse.json({ error: "Falta la especialidad." }, { status: 422 });
  }

  // De quién es esta oferta. Decide el MUNDO: con un paciente del padrón real,
  // los profesionales de una reunión de demostración no figuran; con un paciente
  // de una reunión, figuran SOLO los de esa misma reunión (ver oferta.ts).
  const pacienteId = (req.nextUrl.searchParams.get("paciente_id") ?? "").trim() || null;

  try {
    const res = await armarOferta(especialidad, { pacienteId });
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 422 });
    return NextResponse.json(res.oferta);
  } catch (err) {
    console.error("[otorgador/oferta]", err);
    return NextResponse.json({ error: "No se pudo armar la oferta." }, { status: 500 });
  }
}
