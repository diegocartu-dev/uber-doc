// PATCH /api/otorgador/padron/[id]/contacto — edición inline de contacto desde
// la pantalla del otorgador (spec institucional §4.3; 04-spec §1.2.3: "queda
// guardado en el padrón para las próximas veces").
//
// SOLO contacto: celular y/o mail. La IDENTIDAD (nombre, DNI, nacimiento,
// sexo) NO se edita acá — el padrón lo gestiona la institución por el alta
// provisionada. SOLO instancia institucional; rol otorgador.

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireOtorgador } from "@/lib/auth/rol-institucional";
import { normalizarTelefonoAR } from "@/lib/telefono";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const sesion = await requireOtorgador();
  if (!sesion) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Paciente inválido." }, { status: 400 });

  let body: { celular?: string; email?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido." }, { status: 400 });
  }

  const cambios: Record<string, string> = {};

  if (body.celular !== undefined) {
    const cel = normalizarTelefonoAR(body.celular);
    if (!cel) {
      return NextResponse.json(
        { error: "Celular inválido (no es un móvil argentino de 10 dígitos)." },
        { status: 422 }
      );
    }
    cambios.telefono = cel;
  }

  if (body.email !== undefined) {
    const email = (body.email ?? "").trim().toLowerCase();
    if (!EMAIL_RE.test(email)) {
      return NextResponse.json({ error: "Mail inválido." }, { status: 422 });
    }
    cambios.email = email;
  }

  if (Object.keys(cambios).length === 0) {
    return NextResponse.json({ error: "Nada para actualizar." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("pacientes")
    .update(cambios)
    .eq("id", id)
    .select("id, telefono, email")
    .maybeSingle();

  if (error) {
    // 23505 = índice único parcial de email: otro paciente ya lo tiene.
    if (error.code === "23505") {
      return NextResponse.json({ error: "Ese mail ya pertenece a otro paciente del padrón." }, { status: 422 });
    }
    console.error("[otorgador/contacto] Error actualizando:", error.message);
    return NextResponse.json({ error: "No se pudo guardar." }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "Paciente no encontrado." }, { status: 404 });

  return NextResponse.json({ ok: true, celular: data.telefono ?? null, email: data.email ?? null });
}
