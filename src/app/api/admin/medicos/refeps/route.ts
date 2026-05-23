import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verificarAdmin, getAdminUser } from "@/lib/admin-auth";
import { logAdminAction, ADMIN_ACTIONS } from "@/lib/admin-audit";
import { validarMedicoREFEPS } from "@/lib/refeps/validar";

/**
 * POST /api/admin/medicos/refeps
 * Body: { medicoId: string }
 *
 * Valida un médico contra REFEPS (Bus de Interoperabilidad),
 * guarda el resultado en medicos.refeps_data y marca refeps_validado.
 */
export async function POST(req: NextRequest) {
  const user = await verificarAdmin();
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { medicoId } = await req.json();
  if (!medicoId) {
    return NextResponse.json(
      { error: "medicoId es obligatorio" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // Obtener DNI del médico
  const { data: medico, error: fetchError } = await admin
    .from("medicos")
    .select("id, dni, nombre_completo")
    .eq("id", medicoId)
    .single();

  if (fetchError || !medico) {
    return NextResponse.json(
      { error: "Médico no encontrado" },
      { status: 404 }
    );
  }

  if (!medico.dni) {
    return NextResponse.json(
      { error: "El médico no tiene DNI cargado" },
      { status: 400 }
    );
  }

  // Validar contra REFEPS
  const resultado = await validarMedicoREFEPS(medico.dni);

  const ahora = new Date().toISOString();

  if (resultado.encontrado) {
    // Guardar resultado exitoso
    const { error: updateError } = await admin
      .from("medicos")
      .update({
        refeps_validado: true,
        refeps_data: resultado,
        refeps_validado_at: ahora,
      })
      .eq("id", medicoId);

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 }
      );
    }

    // Audit log
    const adminUser = await getAdminUser(user.id);
    if (adminUser) {
      await logAdminAction({
        adminUserId: adminUser.id,
        accion: ADMIN_ACTIONS.VALIDAR_REFEPS,
        recursoTipo: "medico",
        recursoId: medicoId,
        payloadNuevo: {
          refeps_validado: true,
          matriculas: resultado.matriculas?.length ?? 0,
          activo: resultado.activo,
        },
      });
    }

    return NextResponse.json({
      ok: true,
      refeps_validado: true,
      resultado,
    });
  }

  // No encontrado o error — guardar el intento igual
  const { error: updateError } = await admin
    .from("medicos")
    .update({
      refeps_validado: false,
      refeps_data: resultado,
      refeps_validado_at: ahora,
    })
    .eq("id", medicoId);

  if (updateError) {
    console.error("[REFEPS admin] Error guardando resultado:", updateError);
  }

  return NextResponse.json({
    ok: false,
    refeps_validado: false,
    resultado,
  });
}
