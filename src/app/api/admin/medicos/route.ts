import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verificarAdmin, getAdminUser } from "@/lib/admin-auth";
import { logAdminAction, ADMIN_ACTIONS } from "@/lib/admin-audit";

export async function GET(req: NextRequest) {
  const user = await verificarAdmin();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const estado = req.nextUrl.searchParams.get("estado");
  const admin = createAdminClient();

  let query = admin
    .from("medicos")
    .select("id, nombre_completo, email, dni, tipo_matricula, numero_matricula, provincia_matricula, especialidad, foto_credencial_url, estado_registro, created_at, cuit, user_id, domicilio, verificado, verificado_at, verificado_por, disponible, notas_admin, slug, categoria")
    .order("created_at", { ascending: true });

  if (estado) {
    query = query.eq("estado_registro", estado);
  }

  const { data: medicos, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ medicos: medicos ?? [] });
}

export async function PATCH(req: NextRequest) {
  const user = await verificarAdmin();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const body = await req.json();
  const { medicoId, accion, motivo } = body;
  if (!medicoId || !accion) {
    return NextResponse.json({ error: "medicoId y accion son obligatorios" }, { status: 400 });
  }

  const admin = createAdminClient();
  const ahora = new Date().toISOString();
  const adminUser = await getAdminUser(user.id);

  if (accion === "aprobar") {
    const { error } = await admin
      .from("medicos")
      .update({
        verificado: true,
        estado_registro: "aprobado",
        verificado_at: ahora,
        verificado_por: user.email,
      })
      .eq("id", medicoId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (adminUser) {
      await logAdminAction({
        adminUserId: adminUser.id,
        accion: ADMIN_ACTIONS.APROBAR_MEDICO,
        recursoTipo: "medico",
        recursoId: medicoId,
      });
    }
    return NextResponse.json({ ok: true, estado: "aprobado" });
  }

  if (accion === "rechazar") {
    if (!motivo) return NextResponse.json({ error: "Motivo obligatorio para rechazar" }, { status: 400 });
    const { error } = await admin
      .from("medicos")
      .update({
        estado_registro: "rechazado",
        verificado: false,
        notas_admin: motivo,
      })
      .eq("id", medicoId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (adminUser) {
      await logAdminAction({
        adminUserId: adminUser.id,
        accion: ADMIN_ACTIONS.RECHAZAR_MEDICO,
        recursoTipo: "medico",
        recursoId: medicoId,
        motivo,
      });
    }
    return NextResponse.json({ ok: true, estado: "rechazado" });
  }

  if (accion === "suspender") {
    if (!motivo) return NextResponse.json({ error: "Motivo obligatorio para suspender" }, { status: 400 });
    const { error } = await admin
      .from("medicos")
      .update({
        estado_registro: "suspendido",
        verificado: false,
        disponible: false,
        notas_admin: motivo,
      })
      .eq("id", medicoId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (adminUser) {
      await logAdminAction({
        adminUserId: adminUser.id,
        accion: ADMIN_ACTIONS.SUSPENDER_MEDICO,
        recursoTipo: "medico",
        recursoId: medicoId,
        motivo,
      });
    }
    return NextResponse.json({ ok: true, estado: "suspendido" });
  }

  if (accion === "reactivar") {
    if (!motivo || motivo.trim().length < 10) {
      return NextResponse.json({ error: "Motivo obligatorio (min 10 caracteres)" }, { status: 400 });
    }
    const { error } = await admin
      .from("medicos")
      .update({
        estado_registro: "aprobado",
        verificado: true,
        verificado_at: ahora,
        verificado_por: user.email,
        notas_admin: motivo,
      })
      .eq("id", medicoId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (adminUser) {
      await logAdminAction({
        adminUserId: adminUser.id,
        accion: ADMIN_ACTIONS.REACTIVAR_MEDICO,
        recursoTipo: "medico",
        recursoId: medicoId,
        motivo,
      });
    }
    return NextResponse.json({ ok: true, estado: "aprobado" });
  }

  if (accion === "cambiar_categoria") {
    if (!adminUser || adminUser.nivel !== "super_admin") {
      return NextResponse.json({ error: "Solo super_admin puede cambiar categoria" }, { status: 403 });
    }

    const { nuevaCategoria } = body;
    if (!["founder", "tradicional"].includes(nuevaCategoria)) {
      return NextResponse.json({ error: "Categoria invalida" }, { status: 400 });
    }
    if (!motivo || motivo.trim().length < 10) {
      return NextResponse.json({ error: "Motivo obligatorio (min 10 caracteres)" }, { status: 400 });
    }

    const { data: anterior } = await admin
      .from("medicos")
      .select("categoria")
      .eq("id", medicoId)
      .single();

    if (anterior?.categoria === nuevaCategoria) {
      return NextResponse.json({ error: "El medico ya tiene esa categoria" }, { status: 400 });
    }

    const { error } = await admin
      .from("medicos")
      .update({ categoria: nuevaCategoria })
      .eq("id", medicoId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await logAdminAction({
      adminUserId: adminUser.id,
      accion: ADMIN_ACTIONS.CAMBIAR_CATEGORIA_MEDICO,
      recursoTipo: "medico",
      recursoId: medicoId,
      payloadAnterior: { categoria: anterior?.categoria },
      payloadNuevo: { categoria: nuevaCategoria },
      motivo,
    });

    return NextResponse.json({ ok: true, categoria: nuevaCategoria });
  }

  return NextResponse.json({ error: "Accion no reconocida" }, { status: 400 });
}
