// GET /api/otorgador/padron?q= — búsqueda del padrón para el otorgador
// (spec institucional §4.3; formato del dropdown 04-spec §1.2.1).
//
// SOLO instancia institucional; rol otorgador (o admin_institucion, que lo
// subsume — requireOtorgador). Prefijo desde 3 caracteres: por DNI (solo
// dígitos) o por apellido/nombre (prefijo de palabra). Máximo 6 resultados.
//
// Lectura con service role: la búsqueda del call center no es el paciente
// leyendo su propia fila — RLS no aplica a esta vía (los guards son de
// aplicación, spec §4.3).

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireOtorgador } from "@/lib/auth/rol-institucional";

export const dynamic = "force-dynamic";

export interface PacientePadron {
  id: string;
  nombre_completo: string;
  dni: string | null;
  fecha_nacimiento: string | null;
  edad: number | null;
  sexo_dni: string | null;
  localidad: string | null;
  celular: string | null;
  email: string | null;
}

function edadDesde(fechaNacimiento: string | null): number | null {
  if (!fechaNacimiento) return null;
  const nac = new Date(fechaNacimiento + "T12:00:00");
  if (Number.isNaN(nac.getTime())) return null;
  const hoy = new Date();
  let edad = hoy.getFullYear() - nac.getFullYear();
  const m = hoy.getMonth() - nac.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < nac.getDate())) edad--;
  return edad;
}

export async function GET(req: NextRequest) {
  const sesion = await requireOtorgador();
  if (!sesion) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 3) return NextResponse.json({ resultados: [] });

  const admin = createAdminClient();
  const soloDigitos = q.replace(/[.\s]/g, "");
  const esDNI = /^\d+$/.test(soloDigitos);

  let query = admin
    .from("pacientes")
    .select("id, nombre_completo, dni, fecha_nacimiento, sexo_dni, localidad, telefono, email")
    .order("nombre_completo", { ascending: true })
    .limit(6);

  if (esDNI) {
    query = query.like("dni", `${soloDigitos}%`);
  } else {
    // Prefijo de palabra (apellido o nombre): "cast" matchea "Luis Castro" y
    // "Castro Luis". El % del medio exige límite de palabra (espacio previo).
    // Sin comodines ni separadores de .or(). El '*' también: PostgREST lo
    // traduce a '%' DENTRO del valor de ilike (hallazgo revisión Etapa 2:
    // "***" pasaba el mínimo de 3 chars y listaba el padrón entero).
    const esc = q.replace(/[%_,()*]/g, "");
    if (esc.length < 3) return NextResponse.json({ resultados: [] });
    query = query.or(`nombre_completo.ilike.${esc}%,nombre_completo.ilike.% ${esc}%`);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[otorgador/padron] Error buscando:", error.message);
    return NextResponse.json({ error: "No se pudo buscar en el padrón." }, { status: 500 });
  }

  const resultados: PacientePadron[] = (data ?? []).map((p) => ({
    id: p.id,
    nombre_completo: p.nombre_completo ?? "",
    dni: p.dni ?? null,
    fecha_nacimiento: p.fecha_nacimiento ?? null,
    edad: edadDesde(p.fecha_nacimiento ?? null),
    sexo_dni: p.sexo_dni ?? null,
    localidad: p.localidad ?? null,
    celular: p.telefono ?? null,
    email: p.email ?? null,
  }));

  return NextResponse.json({ resultados });
}
