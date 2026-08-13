"use server";

// Server action de la pantalla del paciente institucional: meterlo en la sala
// de espera cuando toca "Entrar a la consulta".
//
// NO reimplementa nada. Llama a las mismas dos piezas que usa el B2C en
// /turno/[id]/espera — `entrarSalaEspera` (pasa el turno a 'en_espera' y le
// manda el push al profesional) y `registrarEntradaSala` (la fila de la sala +
// el aviso por WhatsApp). Si mañana cambia cómo se avisa que hay un paciente
// esperando, cambia para los dos canales a la vez, que es toda la gracia.
//
// SOLO instancia institucional: en B2C esta action no hace nada.

import { createClient } from "@/lib/supabase/server";
import { esInstitucional } from "@/lib/instancia";
import { entrarSalaEspera } from "@/app/clinica/[medicoId]/turnos/actions";
import { registrarEntradaSala } from "@/lib/sala-espera";

export async function entrarASalaDeEspera(
  turnoId: string
): Promise<{ ok: boolean; error?: string }> {
  if (!esInstitucional()) return { ok: false, error: "No disponible." };

  // El guard de propiedad del turno (paciente correcto, estado 'confirmado')
  // vive adentro de entrarSalaEspera: se confía en ESE, no en una copia.
  const resultado = await entrarSalaEspera(turnoId);
  if ("error" in resultado && resultado.error) {
    return { ok: false, error: resultado.error };
  }

  // Registro de la entrada (idempotente, best-effort): sin esto el profesional
  // no ve al paciente en su sala y no le llega el WhatsApp de respaldo.
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { data: paciente } = await supabase
        .from("pacientes")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      const { data: turno } = await supabase
        .from("turnos")
        .select("medico_id")
        .eq("id", turnoId)
        .maybeSingle();
      if (paciente && turno) {
        // Sin `canalOrigen` a propósito: en la instancia vale 'acordado' u
        // 'ofrecido', que `tipoFromCanalOrigen` no conoce y clasificaría como
        // "ci". Omitiéndolo, la entrada queda como 'turno_programado', que es
        // lo que realmente es (y lo que el metering va a querer leer).
        await registrarEntradaSala({
          pacienteId: paciente.id,
          medicoId: turno.medico_id,
          turnoId,
        });
      }
    }
  } catch (err) {
    console.error("[acceso-turno] No se pudo registrar la entrada a la sala:", err);
  }

  return { ok: true };
}
