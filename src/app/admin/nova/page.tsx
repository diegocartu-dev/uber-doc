export const dynamic = "force-dynamic";

// Qué le piden los profesionales a Nova.
//
// POR QUÉ ESTA PANTALLA (decisión Diego, 10/08/2026): lo que un médico le pide a
// la IA es la lista de lo que le falta a la app, dicha con sus palabras. Sin un
// lugar donde leerlo, guardar las conversaciones no sirve de nada.
//
// LO QUE SE LEE ACÁ ES DATO SENSIBLE. Un profesional puede haberle preguntado a
// Nova sobre un paciente concreto. Las tablas tienen RLS activa sin policies y
// GRANTs revocados: esta página funciona SOLO porque corre en el servidor con
// service role, detrás del layout de /admin. Nunca exponer esto por API pública
// ni pasarlo entero a un componente cliente que no lo necesite.

import { createAdminClient } from "@/lib/supabase/admin";
import NovaConversacionesClient from "./NovaConversacionesClient";

export type MensajeNova = {
  id: string;
  rol: string;
  contenido: string;
  herramienta: string | null;
  orden: number;
  created_at: string;
};

export type ConversacionNova = {
  id: string;
  medico: string;
  iniciada_at: string;
  mensajes: MensajeNova[];
};

export default async function AdminNovaPage() {
  const admin = createAdminClient();

  // Últimas 100 conversaciones. A este volumen (10 profesionales la abrieron
  // alguna vez) alcanza de sobra; cuando crezca se pagina.
  const { data: conversaciones } = await admin
    .from("nova_conversaciones")
    .select("id, medico_id, iniciada_at")
    .order("iniciada_at", { ascending: false })
    .limit(100);

  const convs = conversaciones ?? [];
  const medicoIds = [...new Set(convs.map((c) => c.medico_id))];

  const [{ data: medicos }, { data: mensajes }] = await Promise.all([
    medicoIds.length > 0
      ? admin.from("medicos").select("id, nombre_completo, titulo").in("id", medicoIds)
      : Promise.resolve({ data: [] as { id: string; nombre_completo: string | null; titulo: string | null }[] }),
    convs.length > 0
      ? admin
          .from("nova_mensajes")
          .select("id, conversacion_id, rol, contenido, herramienta, orden, created_at")
          .in("conversacion_id", convs.map((c) => c.id))
          .order("orden", { ascending: true })
      : Promise.resolve({ data: [] as (MensajeNova & { conversacion_id: string })[] }),
  ]);

  const nombrePorMedico = new Map(
    (medicos ?? []).map((m) => [m.id, m.nombre_completo?.trim() || "Sin nombre en ficha"])
  );

  const mensajesPorConv = new Map<string, MensajeNova[]>();
  for (const m of (mensajes ?? []) as (MensajeNova & { conversacion_id: string })[]) {
    const lista = mensajesPorConv.get(m.conversacion_id) ?? [];
    lista.push(m);
    mensajesPorConv.set(m.conversacion_id, lista);
  }

  // Una conversación sin mensajes es ruido: se abrió la fila y el guardado del
  // turno falló, o el profesional cerró antes de escribir. No se muestra.
  const datos: ConversacionNova[] = convs
    .map((c) => ({
      id: c.id,
      medico: nombrePorMedico.get(c.medico_id) ?? "Profesional no encontrado",
      iniciada_at: c.iniciada_at,
      mensajes: mensajesPorConv.get(c.id) ?? [],
    }))
    .filter((c) => c.mensajes.length > 0);

  return <NovaConversacionesClient conversaciones={datos} />;
}
