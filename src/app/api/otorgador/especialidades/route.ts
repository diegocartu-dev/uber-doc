// GET /api/otorgador/especialidades — chips del bloque 2 del otorgador (spec
// institucional §4.3): las especialidades del piloto desde institucion_config
// + flag `ci_activa_ahora` por especialidad (el dot verde) + la ventana de CI.
// SOLO instancia institucional; operador por sesión o API key.

import { NextRequest, NextResponse } from "next/server";
import { identificarOperador } from "@/lib/otorgador/auth";
import { especialidadesConCI } from "@/lib/otorgador/oferta";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const identidad = await identificarOperador(req);
  if (!identidad) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    return NextResponse.json(await especialidadesConCI());
  } catch (err) {
    console.error("[otorgador/especialidades]", err);
    return NextResponse.json({ error: "No se pudo leer la configuración." }, { status: 500 });
  }
}
