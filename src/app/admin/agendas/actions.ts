"use server";

// Server actions de la carga de agendas institucionales (/admin/agendas).
// SOLO instancia institucional: quien levanta las agendas del motor ACORDADO
// es la institución (spec institucional §4.7), no el profesional. La única
// puerta sigue siendo crearAgendaModelo — acá no se re-implementa nada.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/admin-auth";
import { esInstitucional } from "@/lib/instancia";
import { getConfigInstitucion } from "@/lib/institucional/config";
import { crearAgendaModelo, type Franja } from "@/lib/agenda/crear-agenda";

async function guardAdminInstitucionalDocto(): Promise<string | null> {
  if (!esInstitucional()) return null; // en B2C estas actions no existen
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !(await isAdmin(user.id))) return null;
  return user.id;
}

export interface CrearAgendaAcordadaInput {
  medicoId: string;
  nombre: string;
  fecha_inicio: string;
  fecha_fin: string;
  franjas: Franja[];
}

export async function crearAgendaAcordada(
  input: CrearAgendaAcordadaInput
): Promise<{ ok: boolean; error?: string; turnosCreados?: number }> {
  const uid = await guardAdminInstitucionalDocto();
  if (!uid) return { ok: false, error: "No autorizado" };

  // La duración NO viaja desde el form: la define la config de la institución
  // (decisión 12/08). crearAgendaModelo la re-valida server-side igual.
  const config = await getConfigInstitucion();

  const admin = createAdminClient();
  const res = await crearAgendaModelo(admin, {
    medicoId: input.medicoId,
    nombre: input.nombre,
    fecha_inicio: input.fecha_inicio,
    fecha_fin: input.fecha_fin,
    duracion_turno: config.slot_duracion_min,
    precio: 0, // el paciente no paga nunca (R2); crearAgendaModelo lo fuerza igual
    franjas: input.franjas,
    canal_origen: "acordado",
  });

  if (!res.ok) return { ok: false, error: res.mensaje };

  revalidatePath("/admin/agendas");
  return { ok: true, turnosCreados: res.turnosCreados };
}

export async function desactivarAgenda(modeloId: string): Promise<{ ok: boolean; error?: string }> {
  const uid = await guardAdminInstitucionalDocto();
  if (!uid) return { ok: false, error: "No autorizado" };

  const admin = createAdminClient();
  // Desactivar el modelo frena la generación de slots futuros. Los slots
  // DISPONIBLES ya materializados se bloquean; los que tienen paciente
  // (confirmado/en_espera/en_curso) NO se tocan — cancelarlos es reprogramación
  // (motor de la Etapa 6), no una baja de agenda.
  const { error: errModelo } = await admin
    .from("agenda_modelos")
    .update({ activo: false })
    .eq("id", modeloId);
  if (errModelo) {
    console.error("[admin/agendas] Error desactivando modelo:", errModelo.message);
    return { ok: false, error: "No se pudo desactivar la agenda." };
  }
  const { error: errSlots } = await admin
    .from("turnos")
    .update({ estado: "bloqueado" })
    .eq("modelo_id", modeloId)
    .eq("estado", "disponible");
  if (errSlots) {
    console.error("[admin/agendas] Modelo desactivado pero slots sin bloquear:", errSlots.message);
    return { ok: false, error: "La agenda se desactivó pero quedaron slots por liberar. Reintentá." };
  }

  revalidatePath("/admin/agendas");
  return { ok: true };
}
