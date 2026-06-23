import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { trackEvent } from "@/lib/funnel";

// Eventos que emite el MÉDICO (se guardan con medico_id).
const EVENTOS_MEDICO = ["mp_oauth_view_tab", "mp_oauth_start_click"] as const;
// Eventos del recorrido del PACIENTE (se guardan con paciente_id = user.id, igual
// que consultas.paciente_id, para que el funnel y el filtro de test cuadren).
const EVENTOS_PACIENTE = ["clinica_vista", "medico_elegido"] as const;

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: true });
    }

    const body = await req.json();
    const { evento, metadata } = body;

    const admin = createAdminClient();
    const { data: medico } = await admin
      .from("medicos")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (EVENTOS_MEDICO.includes(evento)) {
      await trackEvent({ evento, medicoId: medico?.id ?? null, metadata: metadata ?? {} });
    } else if (EVENTOS_PACIENTE.includes(evento)) {
      // No contaminar el funnel del PACIENTE con médicos que curiosean la clínica:
      // si el usuario es médico, descartamos el evento de paciente.
      if (medico) return NextResponse.json({ ok: true });
      await trackEvent({ evento, pacienteId: user.id, metadata: metadata ?? {} });
    }
    // Cualquier otro evento: se ignora silenciosamente (no se confía en el cliente).
  } catch {
    // Never break the client
  }

  return NextResponse.json({ ok: true });
}
