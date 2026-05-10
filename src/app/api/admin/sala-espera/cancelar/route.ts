import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verificarAdmin, getAdminUser } from "@/lib/admin-auth";
import { logAdminAction, ADMIN_ACTIONS } from "@/lib/admin-audit";
import { notificarMedicoPlantados } from "@/lib/notificaciones-medico";

export async function POST(req: Request) {
  const user = await verificarAdmin();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const adminUser = await getAdminUser(user.id);
  if (!adminUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { entrada_ids, motivo } = await req.json();

  if (!Array.isArray(entrada_ids) || entrada_ids.length === 0) {
    return NextResponse.json({ error: "entrada_ids requerido" }, { status: 400 });
  }
  if (!motivo || typeof motivo !== "string" || motivo.trim().length < 10) {
    return NextResponse.json(
      { error: "Motivo obligatorio (mínimo 10 caracteres)" },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();

  const { data: cerradas, error } = await supabase
    .from("sala_espera_entradas")
    .update({
      salida_en: new Date().toISOString(),
      motivo_salida: "cancelado_admin",
      cancelado_admin_id: adminUser.id,
      motivo_admin: motivo.trim(),
    })
    .in("id", entrada_ids)
    .is("salida_en", null)
    .select("id, medico_id, paciente_id");

  if (error) {
    console.error("[admin/sala-espera/cancelar] Error:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }

  for (const c of cerradas || []) {
    await logAdminAction({
      adminUserId: adminUser.id,
      accion: ADMIN_ACTIONS.CANCELAR_ENTRADA_SALA,
      recursoTipo: "sala_espera",
      recursoId: c.id,
      motivo: motivo.trim(),
    });
  }

  const medicosAfectados = new Map<string, string[]>();
  for (const c of cerradas || []) {
    if (c.medico_id) {
      const arr = medicosAfectados.get(c.medico_id) || [];
      arr.push(c.paciente_id);
      medicosAfectados.set(c.medico_id, arr);
    }
  }

  for (const [medicoId, pacienteIds] of medicosAfectados) {
    try {
      await notificarMedicoPlantados({
        medicoId,
        pacienteIds,
        origen: "cancelacion_admin",
        motivoAdmin: motivo.trim(),
      });
    } catch (e) {
      console.error("[admin/sala-espera/cancelar] Error notificando:", e);
    }
  }

  return NextResponse.json({
    canceladas: cerradas?.length || 0,
    medicos_notificados: medicosAfectados.size,
  });
}
