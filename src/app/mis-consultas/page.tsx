export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppNavbar from "@/components/AppNavbar";
import MisConsultasList from "./MisConsultasList";

export default async function MisConsultasPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  const fullName = user.user_metadata?.full_name || user.email;

  // Only pacientes
  const { data: paciente } = await supabase
    .from("pacientes")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!paciente) redirect("/dashboard");

  // Fetch consultas
  const { data: consultas } = await supabase
    .from("consultas")
    .select("id, especialidad, estado, created_at, medico_id, canal_origen")
    .eq("paciente_id", user.id)
    .order("created_at", { ascending: false });

  // Fetch turnos.
  // OJO: la tabla `turnos` NO tiene columna `especialidad` (sí `medicos`).
  // Pedirla acá hace fallar TODO el SELECT (PostgREST 42703) → `turnos` queda
  // null y el paciente ve solo consultas inmediatas. La especialidad del turno
  // se deriva del médico más abajo. NO volver a agregar `especialidad` acá.
  const { data: turnos } = await supabase
    .from("turnos")
    .select("id, fecha, hora_inicio, estado, medico_id, canal_origen")
    .eq("paciente_id", paciente.id)
    .order("fecha", { ascending: false });

  // Fetch medico names
  const medicoIds = [
    ...new Set([
      ...(consultas ?? []).map((c) => c.medico_id),
      ...(turnos ?? []).map((t) => t.medico_id),
    ].filter(Boolean)),
  ];

  // `titulo` ("Dr."/"Dra.") viaja hasta MisConsultasList para no tratar de "Dr." a una
  // médica. Tiene GRANT SELECT para `authenticated` (verificado en prod). NO sumar otras
  // columnas de `medicos`: una sola sin grant hace fallar el SELECT entero (PostgREST
  // devuelve null en silencio) y el historial se quedaría sin nombres.
  const { data: medicos } = medicoIds.length > 0
    ? await supabase.from("medicos").select("id, nombre_completo, titulo, especialidad").in("id", medicoIds)
    : { data: [] };

  const medicosMap = new Map((medicos ?? []).map((m) => [m.id, m]));

  // Fetch documents for consultas and turnos
  const { data: documentos } = await supabase
    .from("documentos")
    .select("id, tipo, diagnostico, contenido, consulta_id, turno_id, created_at")
    .eq("paciente_id", paciente.id)
    .order("created_at", { ascending: false });

  // Build unified list
  type ConsultaItem = {
    id: string;
    type: "consulta" | "turno";
    date: string;
    estado: string;
    medicoNombre: string;
    // Opcional a propósito: si el médico no está en el mapa no inventamos tratamiento.
    medicoTitulo: string | null;
    especialidad: string;
    canalOrigen: string | null;
    documentos: { id: string; tipo: string; diagnostico: string | null; contenido: string }[];
  };

  const items: ConsultaItem[] = [];

  for (const c of consultas ?? []) {
    const med = medicosMap.get(c.medico_id);
    const docs = (documentos ?? []).filter((d) => d.consulta_id === c.id);
    items.push({
      id: c.id,
      type: "consulta",
      date: c.created_at,
      estado: c.estado,
      medicoNombre: med?.nombre_completo ?? "Medico",
      medicoTitulo: med?.titulo ?? null,
      especialidad: c.especialidad ?? med?.especialidad ?? "",
      canalOrigen: (c as { canal_origen?: string }).canal_origen ?? null,
      documentos: docs.map((d) => ({ id: d.id, tipo: d.tipo, diagnostico: d.diagnostico, contenido: d.contenido })),
    });
  }

  for (const t of turnos ?? []) {
    const med = medicosMap.get(t.medico_id);
    const docs = (documentos ?? []).filter((d) => d.turno_id === t.id);
    items.push({
      id: t.id,
      type: "turno",
      date: t.fecha + "T" + t.hora_inicio,
      estado: t.estado,
      medicoNombre: med?.nombre_completo ?? "Medico",
      medicoTitulo: med?.titulo ?? null,
      especialidad: med?.especialidad ?? "",
      canalOrigen: (t as { canal_origen?: string }).canal_origen ?? null,
      documentos: docs.map((d) => ({ id: d.id, tipo: d.tipo, diagnostico: d.diagnostico, contenido: d.contenido })),
    });
  }

  // Sort by date descending
  items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <div className="min-h-full" style={{ backgroundColor: "var(--color-bg-secondary)" }}>
      <AppNavbar userName={fullName} userRole="paciente" />
      <main className="mx-auto max-w-lg px-4 py-8">
        <h1
          className="text-xl font-bold"
          style={{ color: "var(--color-text-primary)" }}
        >
          Mis consultas
        </h1>
        <p
          className="mt-1 text-sm"
          style={{ color: "var(--color-text-secondary)" }}
        >
          Historial de consultas y turnos
        </p>

        <MisConsultasList items={items} />
      </main>
    </div>
  );
}
