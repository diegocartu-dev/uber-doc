import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin, getAdminUser } from "@/lib/admin-auth";
import { logAdminAction, ADMIN_ACTIONS } from "@/lib/admin-audit";
import { getAllFlags, invalidateFlagsCache } from "@/lib/feature-flags";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !(await isAdmin(user.id))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const flags = await getAllFlags();
  return NextResponse.json({ flags });
}

export async function PATCH(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const adminUser = await getAdminUser(user.id);
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { key, activo, motivo, desdeMobile } = body;

  if (typeof key !== "string" || typeof activo !== "boolean") {
    return NextResponse.json({ error: "Payload invalido" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Obtener estado anterior
  const { data: anterior } = await admin
    .from("feature_flags")
    .select("key, activo, nombre, es_kill_switch")
    .eq("key", key)
    .single();

  if (!anterior) {
    return NextResponse.json({ error: "Flag no existe" }, { status: 404 });
  }

  // Actualizar
  const { error } = await admin
    .from("feature_flags")
    .update({
      activo,
      ultima_modificacion: new Date().toISOString(),
      ultima_modificacion_por: user.id,
    })
    .eq("key", key);

  if (error) {
    return NextResponse.json(
      { error: "Error actualizando flag" },
      { status: 500 }
    );
  }

  // Audit log
  await logAdminAction({
    adminUserId: adminUser.id,
    accion: ADMIN_ACTIONS.CAMBIAR_FEATURE_FLAG,
    recursoTipo: "feature_flag",
    recursoId: key,
    payloadAnterior: { activo: anterior.activo },
    payloadNuevo: { activo },
    motivo:
      motivo ||
      (anterior.es_kill_switch ? "kill switch desde panel" : undefined),
    desdeMobile: !!desdeMobile,
  });

  invalidateFlagsCache();

  return NextResponse.json({ ok: true });
}
