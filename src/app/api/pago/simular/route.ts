import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { transaccionEsDeTest } from "@/lib/pago-test";
import { assertNoInstitucional } from "@/lib/instancia";

export async function POST(req: NextRequest) {
  // Modo institucional: sin Mercado Pago — este endpoint no existe (Capa B).
  if (!assertNoInstitucional()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const { consultaId } = await req.json();
    if (!consultaId) {
      return NextResponse.json({ error: "Falta consultaId" }, { status: 400 });
    }

    // Verificar que el usuario autenticado es el paciente de esta consulta
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const supabaseAdmin = createAdminClient();

    const { data: consulta } = await supabaseAdmin
      .from("consultas")
      .select("id, estado, paciente_id, medico_id")
      .eq("id", consultaId)
      .eq("paciente_id", user.id)
      .single();

    if (!consulta) {
      return NextResponse.json({ error: "Consulta no encontrada" }, { status: 404 });
    }

    // Con el cobro real general ON, simular SOLO está permitido para cuentas de
    // test (paciente o médico). Para usuarios reales con el flag ON, se bloquea
    // (deben pagar de verdad por crear-v2). Antes el guard bloqueaba a TODOS
    // apenas el flag estaba ON → rompía el pago simulado de CI de las cuentas
    // test (su fallback es este endpoint).
    const { getFlag } = await import("@/lib/feature-flags");
    if (await getFlag("pago_marketplace")) {
      const esTest = await transaccionEsDeTest({
        pacienteUserId: user.id,
        medicoId: consulta.medico_id,
      });
      if (!esTest) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
    }

    if (consulta.estado !== "aceptada") {
      return NextResponse.json({ error: "Estado no válido para simular pago" }, { status: 400 });
    }

    await supabaseAdmin
      .from("consultas")
      .update({ estado: "pagada" })
      .eq("id", consultaId);

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
