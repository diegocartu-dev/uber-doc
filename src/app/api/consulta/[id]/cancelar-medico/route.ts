import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cerrarEntradaSala } from "@/lib/sala-espera";
import { ejecutarRefund } from "@/lib/cancelaciones";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: consultaId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { data: medico } = await supabase
    .from("medicos")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!medico) {
    return NextResponse.json({ error: "No es medico" }, { status: 403 });
  }

  const admin = createAdminClient();

  const { data: consulta } = await admin
    .from("consultas")
    .select("id, estado, medico_id, pago_id, mp_net_amount_medico, mp_application_fee")
    .eq("id", consultaId)
    .eq("medico_id", medico.id)
    .in("estado", ["aceptada", "pagada", "en_curso"])
    .maybeSingle();

  if (!consulta) {
    return NextResponse.json(
      { error: "Consulta no encontrada o no cancelable" },
      { status: 404 }
    );
  }

  // Refund total: alcanza con pago_id (MP revierte médico + comisión Docto por el split).
  let reintegroEstado: string | null = null;
  if (consulta.pago_id) {
    reintegroEstado = await ejecutarRefund(
      consultaId,
      medico.id,
      consulta.pago_id,
      consulta.mp_net_amount_medico ?? 0,
      consulta.mp_application_fee ?? 0,
      "consulta"
    );
  }

  const { error } = await admin
    .from("consultas")
    .update({
      estado: "cancelada",
      reintegro_estado: reintegroEstado,
    })
    .eq("id", consultaId)
    .eq("medico_id", medico.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  cerrarEntradaSala({ consultaId, motivo: "cancelado_medico" }).catch(() => {});

  return NextResponse.json({ ok: true, reintegro_estado: reintegroEstado });
}
