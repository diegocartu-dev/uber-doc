export const dynamic = "force-dynamic";
// "Mis pacientes" — índice por paciente del médico (Evoluciones, pieza 2B)
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppNavbar from "@/components/AppNavbar";
import MisPacientesClient, { type PacienteResumen } from "./MisPacientesClient";

function calcularEdad(fechaNac: string | null): number | null {
  if (!fechaNac) return null;
  const hoy = new Date();
  const nac = new Date(fechaNac);
  if (isNaN(nac.getTime())) return null;
  let edad = hoy.getFullYear() - nac.getFullYear();
  const m = hoy.getMonth() - nac.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < nac.getDate())) edad--;
  return edad >= 0 ? edad : null;
}

export default async function MisPacientesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: medico } = await supabase
    .from("medicos")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!medico) redirect("/dashboard");

  const fullName = user.user_metadata?.full_name || user.email;

  // ── Atenciones del médico ──────────────────────────────────────────────
  // OJO modelo de datos (CLAUDE.md):
  //   consultas.paciente_id → auth.users.id (resolver vía pacientes.user_id)
  //   turnos.paciente_id    → pacientes.id  (directo)
  // Por eso se agrupa todo a pacientes.id como clave única.

  const [{ data: consultas }, { data: turnos }] = await Promise.all([
    supabase
      .from("consultas")
      .select("created_at, paciente_id, motivo_consulta")
      .eq("medico_id", medico.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("turnos")
      .select("fecha, hora_inicio, paciente_id")
      .eq("medico_id", medico.id),
  ]);

  // Resolver pacientes.id para las consultas (paciente_id = auth.users.id)
  const userIdsConsultas = [...new Set((consultas ?? []).map((c) => c.paciente_id))];
  const { data: pacsPorUser } = userIdsConsultas.length > 0
    ? await supabase
        .from("pacientes")
        .select("id, user_id, nombre_completo, fecha_nacimiento")
        .in("user_id", userIdsConsultas)
    : { data: [] };
  const porUserId = new Map(
    (pacsPorUser ?? []).map((p) => [p.user_id, p])
  );

  // Resolver datos de pacientes referenciados directo por los turnos
  const pacIdsTurnos = [...new Set((turnos ?? []).map((t) => t.paciente_id))];
  const { data: pacsPorId } = pacIdsTurnos.length > 0
    ? await supabase
        .from("pacientes")
        .select("id, nombre_completo, fecha_nacimiento")
        .in("id", pacIdsTurnos)
    : { data: [] };
  const porPacId = new Map((pacsPorId ?? []).map((p) => [p.id, p]));

  // Patologías crónicas del médico con sus pacientes (un solo query)
  const { data: perfiles } = await supabase
    .from("medico_paciente_perfil")
    .select("paciente_id, patologia_cronica")
    .eq("medico_user_id", user.id);
  const tieneCronicaPorPac = new Map(
    (perfiles ?? []).map((p) => [
      p.paciente_id,
      Array.isArray(p.patologia_cronica) && p.patologia_cronica.length > 0,
    ])
  );

  // ── Agrupar por paciente.id ────────────────────────────────────────────
  type Acc = {
    id: string;
    nombre: string;
    fecha_nacimiento: string | null;
    nAtenciones: number;
    ultimaFecha: string; // ISO para ordenar
    ultimoMotivo: string | null;
    ultimoMotivoFecha: number; // timestamp del motivo más reciente
  };
  const acc = new Map<string, Acc>();

  function bump(
    pacId: string,
    nombre: string,
    fechaNac: string | null,
    fechaISO: string,
    motivo: string | null
  ) {
    const ts = new Date(fechaISO).getTime();
    const cur = acc.get(pacId);
    if (!cur) {
      acc.set(pacId, {
        id: pacId,
        nombre,
        fecha_nacimiento: fechaNac,
        nAtenciones: 1,
        ultimaFecha: fechaISO,
        ultimoMotivo: motivo,
        ultimoMotivoFecha: motivo ? ts : 0,
      });
      return;
    }
    cur.nAtenciones += 1;
    if (ts > new Date(cur.ultimaFecha).getTime()) cur.ultimaFecha = fechaISO;
    if (motivo && ts >= cur.ultimoMotivoFecha) {
      cur.ultimoMotivo = motivo;
      cur.ultimoMotivoFecha = ts;
    }
  }

  for (const c of consultas ?? []) {
    const p = porUserId.get(c.paciente_id);
    if (!p) continue; // sin perfil de paciente resoluble — se omite
    bump(p.id, p.nombre_completo, p.fecha_nacimiento, c.created_at, c.motivo_consulta);
  }

  for (const t of turnos ?? []) {
    const p = porPacId.get(t.paciente_id);
    if (!p) continue;
    // Turnos no tienen motivo de consulta; aportan a N atenciones y a la recencia.
    const iso = `${t.fecha}T${(t.hora_inicio ?? "00:00:00").slice(0, 8)}`;
    bump(t.paciente_id, p.nombre_completo, p.fecha_nacimiento, iso, null);
  }

  const pacientes: PacienteResumen[] = [...acc.values()]
    .sort((a, b) => new Date(b.ultimaFecha).getTime() - new Date(a.ultimaFecha).getTime())
    .map((p) => ({
      id: p.id,
      nombre: p.nombre,
      edad: calcularEdad(p.fecha_nacimiento),
      nAtenciones: p.nAtenciones,
      ultimoMotivo: p.ultimoMotivo,
      ultimaFecha: p.ultimaFecha,
      tieneCronica: tieneCronicaPorPac.get(p.id) ?? false,
    }));

  return (
    <div className="min-h-full bg-[#f8f9fa]">
      <AppNavbar userName={fullName} userRole="medico" />
      <main className="mx-auto max-w-3xl px-6 py-6">
        <MisPacientesClient pacientes={pacientes} />
      </main>
    </div>
  );
}
