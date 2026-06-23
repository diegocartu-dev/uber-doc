import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verificarAdmin } from "@/lib/admin-auth";

// Envío de notificaciones admin → médico(s). Solo admin (verificarAdmin).
// target.tipo: "medico" (uno, por id) | "no_validados" (segmento) | "todos" (todos los inscriptos).
// Se inserta una fila por destinatario. Llega a CUALQUIER estado de registro
// (pendiente/aprobado/rechazado/suspendido): el canal es para todos los inscriptos.

type Body = {
  titulo?: string;
  mensaje?: string;
  target?: { tipo?: "medico" | "no_validados" | "todos"; medicoId?: string };
};

export async function POST(req: NextRequest) {
  const user = await verificarAdmin();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido." }, { status: 400 });
  }

  const titulo = body.titulo?.trim();
  const mensaje = body.mensaje?.trim();
  const tipo = body.target?.tipo;
  if (!titulo || !mensaje || !tipo) {
    return NextResponse.json({ error: "Faltan título, mensaje o destinatario." }, { status: 400 });
  }

  const admin = createAdminClient();

  // Resolver destinatarios. Las cuentas de test (infra interna) se excluyen siempre.
  let q = admin.from("medicos").select("id").eq("es_cuenta_test", false);
  if (tipo === "medico") {
    if (!body.target?.medicoId) return NextResponse.json({ error: "Falta el médico." }, { status: 400 });
    q = q.eq("id", body.target.medicoId);
  } else if (tipo === "no_validados") {
    // No validaron identidad (ni exentos): los que aparecen grisados o aún no habilitados.
    q = q.eq("identidad_validada", false).eq("biometria_exenta", false);
  }
  // tipo === "todos" → sin filtro extra: todos los inscriptos, cualquier estado de registro.

  const { data: medicos } = await q;
  if (!medicos || medicos.length === 0) {
    return NextResponse.json({ ok: true, enviadas: 0 });
  }

  const filas = medicos.map((m) => ({
    medico_id: m.id,
    titulo,
    mensaje,
    enviada_por: user.id,
  }));

  const { error } = await admin.from("notificaciones_medico").insert(filas);
  if (error) {
    return NextResponse.json({ error: "No se pudo enviar." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, enviadas: filas.length });
}
