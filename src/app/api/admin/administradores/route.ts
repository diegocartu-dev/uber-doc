import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminUser, requireSuperAdmin } from "@/lib/admin-auth";
import { logAdminAction, ADMIN_ACTIONS } from "@/lib/admin-audit";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !(await getAdminUser(user.id))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: admins } = await admin
    .from("admin_users")
    .select("id, user_id, nivel, activo, creado_en, ultimo_login, desactivado_en, motivo_desactivacion")
    .order("creado_en", { ascending: true });

  // Enriquecer con emails de auth.users
  const enriched = [];
  for (const a of admins ?? []) {
    const { data: authUser } = await admin.auth.admin.getUserById(a.user_id);
    enriched.push({
      ...a,
      email: authUser?.user?.email ?? "—",
    });
  }

  return NextResponse.json({ administradores: enriched });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  let adminUser;
  try {
    adminUser = await requireSuperAdmin(user.id);
  } catch {
    return NextResponse.json(
      { error: "Solo super_admin puede crear admins" },
      { status: 403 }
    );
  }

  const body = await req.json();
  const { email, nivel } = body;

  if (!email || !["super_admin", "admin"].includes(nivel)) {
    return NextResponse.json(
      { error: "Email y nivel requeridos" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // Buscar user_id por email en auth.users
  const { data: usersData } = await admin.auth.admin.listUsers();
  const targetUser = usersData?.users?.find(
    (u) => u.email?.toLowerCase() === email.toLowerCase()
  );

  if (!targetUser) {
    return NextResponse.json(
      {
        error:
          "El email no existe en auth.users. El usuario debe tener cuenta creada primero.",
      },
      { status: 404 }
    );
  }

  // Verificar que no sea admin ya
  const { data: existing } = await admin
    .from("admin_users")
    .select("id, activo")
    .eq("user_id", targetUser.id)
    .maybeSingle();

  if (existing?.activo) {
    return NextResponse.json(
      { error: "Este usuario ya es admin activo" },
      { status: 400 }
    );
  }

  if (existing && !existing.activo) {
    // Reactivar
    await admin
      .from("admin_users")
      .update({
        activo: true,
        nivel,
        desactivado_en: null,
        desactivado_por: null,
        motivo_desactivacion: null,
      })
      .eq("id", existing.id);

    await logAdminAction({
      adminUserId: adminUser.id,
      accion: ADMIN_ACTIONS.REACTIVAR_ADMIN,
      recursoTipo: "admin_user",
      recursoId: existing.id,
      payloadNuevo: { email, nivel, reactivado: true },
    });

    return NextResponse.json({ ok: true, reactivado: true });
  }

  // Crear nuevo
  const { error } = await admin.from("admin_users").insert({
    user_id: targetUser.id,
    nivel,
    activo: true,
    creado_por: user.id,
  });

  if (error) {
    return NextResponse.json(
      { error: "Error creando admin" },
      { status: 500 }
    );
  }

  await logAdminAction({
    adminUserId: adminUser.id,
    accion: ADMIN_ACTIONS.CREAR_ADMIN,
    recursoTipo: "admin_user",
    payloadNuevo: { email, nivel },
  });

  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  let adminUser;
  try {
    adminUser = await requireSuperAdmin(user.id);
  } catch {
    return NextResponse.json({ error: "Solo super_admin" }, { status: 403 });
  }

  const body = await req.json();
  const { adminId, accion, motivo } = body;

  const admin = createAdminClient();

  if (accion === "desactivar") {
    // No puede desactivarse a si mismo
    const { data: target } = await admin
      .from("admin_users")
      .select("user_id")
      .eq("id", adminId)
      .single();

    if (target?.user_id === user.id) {
      return NextResponse.json(
        { error: "No podes desactivarte a vos mismo" },
        { status: 400 }
      );
    }

    await admin
      .from("admin_users")
      .update({
        activo: false,
        desactivado_en: new Date().toISOString(),
        desactivado_por: user.id,
        motivo_desactivacion: motivo || null,
      })
      .eq("id", adminId);

    await logAdminAction({
      adminUserId: adminUser.id,
      accion: ADMIN_ACTIONS.DESACTIVAR_ADMIN,
      recursoTipo: "admin_user",
      recursoId: adminId,
      motivo,
    });

    return NextResponse.json({ ok: true });
  }

  if (accion === "cambiar_nivel") {
    const { nuevoNivel } = body;
    if (!["super_admin", "admin"].includes(nuevoNivel)) {
      return NextResponse.json(
        { error: "Nivel invalido" },
        { status: 400 }
      );
    }

    await admin
      .from("admin_users")
      .update({ nivel: nuevoNivel })
      .eq("id", adminId);

    await logAdminAction({
      adminUserId: adminUser.id,
      accion: ADMIN_ACTIONS.CAMBIAR_NIVEL_ADMIN,
      recursoTipo: "admin_user",
      recursoId: adminId,
      payloadNuevo: { nivel: nuevoNivel },
    });

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json(
    { error: "Accion no soportada" },
    { status: 400 }
  );
}
