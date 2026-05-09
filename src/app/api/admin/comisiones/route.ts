import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminUser } from "@/lib/admin-auth";
import { logAdminAction, ADMIN_ACTIONS } from "@/lib/admin-audit";
import {
  getComisionesGlobales,
  getRegimenNuevosMedicos,
} from "@/lib/comisiones";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !(await getAdminUser(user.id))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const [comisiones, regimen] = await Promise.all([
    getComisionesGlobales(),
    getRegimenNuevosMedicos(),
  ]);

  const admin = createAdminClient();
  const { data: medicosCount } = await admin
    .from("medicos")
    .select("categoria")
    .eq("verificado", true);

  const founders =
    medicosCount?.filter((m) => m.categoria === "founder").length || 0;
  const tradicionales =
    medicosCount?.filter((m) => m.categoria === "tradicional").length || 0;

  return NextResponse.json({
    comisiones,
    regimenNuevos: regimen,
    stats: {
      foundersActivos: founders,
      tradicionalActivos: tradicionales,
      totalActivos: founders + tradicionales,
    },
  });
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
  if (!adminUser || adminUser.nivel !== "super_admin") {
    return NextResponse.json(
      { error: "Solo super_admin" },
      { status: 403 }
    );
  }

  const body = await req.json();
  const { tipo } = body;
  const admin = createAdminClient();

  if (tipo === "cambiar_porcentaje") {
    const { categoria, nuevoPorcentaje, motivo } = body;

    if (!["founder", "tradicional"].includes(categoria)) {
      return NextResponse.json(
        { error: "Categoria invalida" },
        { status: 400 }
      );
    }
    if (
      typeof nuevoPorcentaje !== "number" ||
      nuevoPorcentaje < 0 ||
      nuevoPorcentaje > 100
    ) {
      return NextResponse.json(
        { error: "Porcentaje invalido" },
        { status: 400 }
      );
    }
    if (!motivo || motivo.trim().length < 10) {
      return NextResponse.json(
        { error: "Motivo obligatorio (min 10 caracteres)" },
        { status: 400 }
      );
    }

    const { data: anterior } = await admin
      .from("comisiones_config")
      .select("porcentaje")
      .eq("categoria", categoria)
      .single();

    await admin
      .from("comisiones_config")
      .update({
        porcentaje: nuevoPorcentaje,
        ultima_modificacion: new Date().toISOString(),
        ultima_modificacion_por: user.id,
        motivo_ultimo_cambio: motivo,
      })
      .eq("categoria", categoria);

    await logAdminAction({
      adminUserId: adminUser.id,
      accion: ADMIN_ACTIONS.CAMBIAR_COMISION_GLOBAL,
      recursoTipo: "comision",
      recursoId: categoria,
      payloadAnterior: { porcentaje: Number(anterior?.porcentaje) },
      payloadNuevo: { porcentaje: nuevoPorcentaje },
      motivo,
    });

    return NextResponse.json({ ok: true });
  }

  if (tipo === "cambiar_regimen_nuevos") {
    const { nuevaCategoria } = body;

    if (!["founder", "tradicional"].includes(nuevaCategoria)) {
      return NextResponse.json(
        { error: "Categoria invalida" },
        { status: 400 }
      );
    }

    const { data: anterior } = await admin
      .from("regimen_nuevos_medicos")
      .select("categoria_actual")
      .eq("id", 1)
      .single();

    await admin
      .from("regimen_nuevos_medicos")
      .update({
        categoria_actual: nuevaCategoria,
        ultima_modificacion: new Date().toISOString(),
        ultima_modificacion_por: user.id,
      })
      .eq("id", 1);

    await logAdminAction({
      adminUserId: adminUser.id,
      accion: ADMIN_ACTIONS.CAMBIAR_REGIMEN_NUEVOS,
      recursoTipo: "sistema",
      payloadAnterior: {
        categoria_actual: anterior?.categoria_actual,
      },
      payloadNuevo: { categoria_actual: nuevaCategoria },
    });

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json(
    { error: "Tipo no soportado" },
    { status: 400 }
  );
}
