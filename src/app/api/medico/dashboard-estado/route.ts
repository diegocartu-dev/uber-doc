import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { data: medico } = await supabase
    .from("medicos")
    .select("id, disponible")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!medico)
    return NextResponse.json({ error: "No es médico" }, { status: 403 });

  const medicoId = medico.id;

  // Helper: dado un array de consultas con paciente_id (user_id), enriquecer con datos de pacientes
  async function enrichPacientes(rows: { paciente_id: string }[]) {
    const ids = [...new Set(rows.map((r) => r.paciente_id))];
    if (ids.length === 0)
      return new Map<
        string,
        { id: string; nombre: string; nacimiento: string | null }
      >();
    const { data: pacs } = await supabase
      .from("pacientes")
      .select("id, user_id, nombre_completo, fecha_nacimiento")
      .in("user_id", ids);
    return new Map(
      (pacs ?? []).map((p) => [
        p.user_id,
        {
          id: p.id,
          nombre: p.nombre_completo,
          nacimiento: p.fecha_nacimiento,
        },
      ])
    );
  }

  // 1. Consultas pendientes (esperando)
  const { data: esperando } = await supabase
    .from("consultas")
    .select(
      "id, especialidad, estado, created_at, paciente_id, motivo_consulta, canal_origen"
    )
    .eq("medico_id", medicoId)
    .eq("estado", "esperando")
    .order("created_at", { ascending: true });

  const pacMapPend = await enrichPacientes(esperando ?? []);
  const consultas_pendientes = (esperando ?? []).map((c) => {
    const p = pacMapPend.get(c.paciente_id);
    return {
      id: c.id,
      especialidad: c.especialidad,
      estado: c.estado,
      created_at: c.created_at,
      paciente_nombre: p?.nombre ?? "Paciente",
      paciente_tabla_id: p?.id ?? null,
      motivo_consulta: c.motivo_consulta,
      fecha_nacimiento: p?.nacimiento ?? null,
      canal_origen: (c as { canal_origen?: string }).canal_origen ?? null,
    };
  });

  // 2. Consultas en curso (aceptada + en_curso)
  const { data: enCurso } = await supabase
    .from("consultas")
    .select(
      "id, especialidad, paciente_id, sala_video_url, motivo_consulta, sintomas, created_at, estado, canal_origen"
    )
    .eq("medico_id", medicoId)
    .in("estado", ["aceptada", "pagada", "en_curso"])
    .order("created_at", { ascending: true });

  const pacMapCurso = await enrichPacientes(enCurso ?? []);
  const consultas_en_curso = (enCurso ?? []).map((c) => {
    const p = pacMapCurso.get(c.paciente_id);
    return {
      id: c.id,
      especialidad: c.especialidad,
      estado: c.estado,
      paciente_nombre: p?.nombre ?? "Paciente",
      paciente_tabla_id: p?.id ?? null,
      sala_video_url: c.sala_video_url,
      motivo_consulta: c.motivo_consulta,
      sintomas: c.sintomas,
      created_at: c.created_at,
      fecha_nacimiento: p?.nacimiento ?? null,
      canal_origen: (c as { canal_origen?: string }).canal_origen ?? null,
    };
  });

  // 3. Turnos en espera (hoy)
  const ahoraAR = new Date(
    new Date().toLocaleString("en-US", {
      timeZone: "America/Argentina/Buenos_Aires",
    })
  );
  const pad = (n: number) => n.toString().padStart(2, "0");
  const hoy = `${ahoraAR.getFullYear()}-${pad(ahoraAR.getMonth() + 1)}-${pad(ahoraAR.getDate())}`;

  const { data: turnosEspera } = await supabase
    .from("turnos")
    .select("id, fecha, hora_inicio, paciente_id, estado, canal_origen")
    .eq("medico_id", medicoId)
    .eq("estado", "en_espera")
    .order("hora_inicio", { ascending: true });

  const pacIdsEsp = [
    ...new Set(
      (turnosEspera ?? []).map((t) => t.paciente_id).filter(Boolean)
    ),
  ];
  const { data: pacsEsp } =
    pacIdsEsp.length > 0
      ? await supabase
          .from("pacientes")
          .select("id, nombre_completo")
          .in("id", pacIdsEsp)
      : { data: [] };
  const nombresEsp = new Map(
    (pacsEsp ?? []).map((p) => [p.id, p.nombre_completo])
  );
  const turnos_espera = (turnosEspera ?? []).map((t) => ({
    id: t.id,
    fecha: t.fecha,
    hora_inicio: t.hora_inicio,
    paciente_nombre: nombresEsp.get(t.paciente_id) ?? "Paciente",
    paciente_tabla_id: t.paciente_id,
    especialidad: "",
    canal_origen: (t as { canal_origen?: string }).canal_origen ?? null,
  }));

  // 4. Turnos en_curso ahora mismo → bloquear CI
  const { count: turnosActivosHoy } = await supabase
    .from("turnos")
    .select("id", { count: "exact", head: true })
    .eq("medico_id", medicoId)
    .eq("estado", "en_curso");

  return NextResponse.json({
    consultas_pendientes,
    consultas_en_curso,
    turnos_espera,
    disponible: medico.disponible,
    turnos_activos_hoy: turnosActivosHoy ?? 0,
    timestamp: Date.now(),
  });
}
