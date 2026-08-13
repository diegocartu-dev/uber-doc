"use server";

// Server action de la pantalla del paciente institucional para la CONSULTA
// INMEDIATA: registrar que llegó, y avisarle al profesional.
//
// NO reimplementa nada: llama a las mismas dos piezas que usa el B2C en
// /sala-espera/[consultaId] — `registrarEntradaSala` (la fila de la sala + el
// WhatsApp de respaldo) y `pushAlMedico`. Si mañana cambia cómo se avisa que
// hay alguien esperando, cambia para los dos canales a la vez.
//
// ── POR QUÉ ESTO NO ES COSMÉTICO ─────────────────────────────────────────────
// La fila en `sala_espera_entradas` es la ÚNICA evidencia de que el paciente
// estuvo. A los 30 minutos, el plazo de la CI la mira para decidir si esto
// terminó en ausencia del paciente o en ausencia del profesional
// (`resolver-vencidas.ts`). Sin registrar la entrada, el paciente que esperó
// media hora frente a la pantalla quedaría marcado como el que faltó.
//
// SOLO instancia institucional: en B2C esta action no hace nada.

import { createClient } from "@/lib/supabase/server";
import { esInstitucional } from "@/lib/instancia";
import { registrarEntradaSala } from "@/lib/sala-espera";
import { pushAlMedico } from "@/lib/push";

export async function entrarAConsultaInmediata(
  consultaId: string
): Promise<{ ok: boolean; error?: string }> {
  if (!esInstitucional()) return { ok: false, error: "No disponible." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Tu enlace ya no está activo." };

  // Propiedad de la consulta con el cliente RLS: la CI es del paciente que la
  // pide o no es de nadie. (`consultas.paciente_id` = auth.users.id — la
  // asimetría heredada del B2C.)
  const { data: consulta } = await supabase
    .from("consultas")
    .select("id, medico_id, estado")
    .eq("id", consultaId)
    .eq("paciente_id", user.id)
    .maybeSingle();
  if (!consulta) return { ok: false, error: "Tu enlace ya no está activo." };
  if (!["pagada", "en_curso"].includes(consulta.estado)) {
    return { ok: false, error: "Esta consulta ya no está activa. Actualizá la pantalla." };
  }

  const { data: paciente } = await supabase
    .from("pacientes")
    .select("id, nombre_completo")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!paciente) return { ok: false, error: "Tu enlace ya no está activo." };

  try {
    await registrarEntradaSala({
      pacienteId: paciente.id,
      medicoId: consulta.medico_id,
      consultaId: consulta.id,
      canalOrigen: "espontaneo", // en la instancia la CI es siempre este motor
    });
  } catch (err) {
    // No se corta el ingreso por esto: el paciente entra igual y el profesional
    // ya tenía el aviso de la asignación. Queda en los logs porque afecta la
    // resolución del plazo (ver el bloque de arriba).
    console.error("[acceso-ci] No se pudo registrar la entrada a la sala:", err);
  }

  // Aviso al profesional (best-effort, mismo copy que el B2C).
  void pushAlMedico(consulta.medico_id, {
    title: "🟢 Consulta inmediata",
    body: `${paciente.nombre_completo ?? "Un paciente"} está esperando`,
    url: "/dashboard",
    tag: `espera-ci-${consulta.id}`,
  }).catch(() => {});

  return { ok: true };
}
