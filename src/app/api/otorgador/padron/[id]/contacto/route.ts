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

  // Valores ANTERIORES antes de pisar: son el insumo de la bitácora de abajo.
  const { data: previo, error: errPrevio } = await admin
    .from("pacientes")
    .select("id, user_id, telefono, email")
    .eq("id", id)
    .maybeSingle();
  if (errPrevio) {
    console.error("[otorgador/contacto] Error leyendo paciente:", errPrevio.message);
    return NextResponse.json({ error: "No se pudo guardar." }, { status: 500 });
  }
  if (!previo) return NextResponse.json({ error: "Paciente no encontrado." }, { status: 404 });

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

  // Bitácora del retargeting (hallazgo revisión Etapa 2 — tabla padron_cambios,
  // migración 010): el link de acceso es la llave de la cuenta del paciente, y
  // "edito el contacto → asigno → el acceso llega al número nuevo" tiene que
  // quedar trazado con operador, campo y valor viejo → nuevo. Best-effort CON
  // registro: un fallo acá no revierte el cambio ya hecho, pero queda en logs.
  const bitacora = Object.entries(cambios)
    .filter(([campo, nuevo]) => (previo[campo as "telefono" | "email"] ?? null) !== nuevo)
    .map(([campo, nuevo]) => ({
      paciente_id: id,
      operador_id: sesion.operador.id,
      campo: campo === "telefono" ? "telefono" : "email",
      valor_anterior: previo[campo as "telefono" | "email"] ?? null,
      valor_nuevo: nuevo,
    }));
  if (bitacora.length > 0) {
    const { error: errBitacora } = await admin.from("padron_cambios").insert(bitacora);
    if (errBitacora) {
      console.error("[otorgador/contacto] Cambio guardado pero bitácora NO registrada:", errBitacora.message, id);
    }
  }

  // Mail nuevo → sincronizar auth.users como hace provisionarPaciente (si no,
  // auth y padrón divergen — nota del mismo hallazgo). Best-effort: un mail en
  // uso por otra cuenta auth no frena el cambio del padrón, pero no pasa mudo.
  if (cambios.email && previo.user_id && cambios.email !== previo.email) {
    const { error: errAuth } = await admin.auth.admin.updateUserById(previo.user_id, {
      email: cambios.email,
      email_confirm: true,
    });
    if (errAuth) console.error("[otorgador/contacto] No se pudo actualizar email en auth:", errAuth.message);
  }

  return NextResponse.json({ ok: true, celular: data.telefono ?? null, email: data.email ?? null });
}
