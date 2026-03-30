import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import LogoutButton from "./LogoutButton";
import DisponibilidadMedico from "./DisponibilidadMedico";
import ConsultasPendientes from "./ConsultasPendientes";
import ConsultasEnCurso from "./ConsultasEnCurso";
import AdminConsultas from "./AdminConsultas";
import TurnosEnEspera from "./TurnosEnEspera";
import AgendaHoy from "./AgendaHoy";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const fullName = user.user_metadata?.full_name || user.email;
  let role = user.user_metadata?.role;

  // Fallback: si no hay rol en metadata, verificar en tablas
  if (!role) {
    const { data: esMedico } = await supabase
      .from("medicos").select("id").eq("user_id", user.id).maybeSingle();
    if (esMedico) {
      role = "medico";
    } else {
      const { data: esPaciente } = await supabase
        .from("pacientes").select("id").eq("user_id", user.id).maybeSingle();
      if (esPaciente) role = "paciente";
    }
  }

  // --- MÉDICO ---
  let medico: {
    id: string;
    disponible: boolean;
    disponible_desde: string | null;
    disponible_hasta: string | null;
    duracion_consulta: number;
    precio_consulta: number;
  } | null = null;

  let consultasPendientes: {
    id: string;
    especialidad: string;
    estado: string;
    created_at: string;
    paciente_nombre: string;
    paciente_tabla_id: string | null;
    motivo_consulta: string | null;
    fecha_nacimiento: string | null;
  }[] = [];

  let consultasEnCurso: {
    id: string;
    especialidad: string;
    paciente_nombre: string;
    paciente_tabla_id: string | null;
    sala_video_url: string | null;
    motivo_consulta: string | null;
    sintomas: string[] | null;
    created_at: string;
    fecha_nacimiento: string | null;
  }[] = [];

  let todasLasConsultas: {
    id: string;
    especialidad: string;
    estado: string;
    created_at: string;
    motivo_consulta: string | null;
    sintomas: string[] | null;
    sala_video_url: string | null;
    paciente_nombre: string;
    paciente_tabla_id: string | null;
    medico_nombre: string;
  }[] = [];

  let completadasHoy = 0;
  let ingresosHoy = 0;
  let numModelosActivos = 0;
  let turnosEsperaCompletos: { id: string; fecha: string; hora_inicio: string; paciente_nombre: string; especialidad: string }[] = [];
  let turnosHoy: { id: string; hora_inicio: string; hora_fin: string; estado: string; paciente_nombre: string }[] = [];

  // --- PACIENTE ---
  let consultaActiva: {
    id: string;
    especialidad: string;
    estado: string;
    sala_video_url: string | null;
    medico_nombre: string;
  } | null = null;

  let turnosPaciente: {
    id: string;
    fecha: string;
    hora_inicio: string;
    estado: string;
    especialidad: string;
    medico_nombre: string;
  }[] = [];

  if (role === "paciente") {
    // Traer paciente.id para buscar turnos
    const { data: pacienteData } = await supabase
      .from("pacientes").select("id").eq("user_id", user.id).maybeSingle();

    if (pacienteData) {
      const hoyStr = new Date().toISOString().split("T")[0];
      const { data: turnosData } = await supabase
        .from("turnos")
        .select("id, fecha, hora_inicio, estado, medico_id")
        .eq("paciente_id", pacienteData.id)
        .in("estado", ["confirmado", "en_espera"])
        .gte("fecha", hoyStr)
        .order("fecha", { ascending: true })
        .order("hora_inicio", { ascending: true });

      if (turnosData && turnosData.length > 0) {
        const medIds = [...new Set(turnosData.map((t) => t.medico_id))];
        const { data: meds } = await supabase
          .from("medicos").select("id, nombre_completo, especialidad").in("id", medIds);
        const medMap = new Map((meds ?? []).map((m) => [m.id, m]));

        turnosPaciente = turnosData.map((t) => {
          const med = medMap.get(t.medico_id);
          return {
            id: t.id,
            fecha: t.fecha,
            hora_inicio: t.hora_inicio,
            estado: t.estado,
            especialidad: med?.especialidad ?? "",
            medico_nombre: med?.nombre_completo ?? "Médico",
          };
        });
      }
    }

    const { data: activa } = await supabase
      .from("consultas")
      .select("id, especialidad, estado, sala_video_url, medico_id")
      .eq("paciente_id", user.id)
      .in("estado", ["aceptada", "en_curso"])
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (activa) {
      const { data: med } = await supabase
        .from("medicos")
        .select("nombre_completo")
        .eq("id", activa.medico_id)
        .single();

      consultaActiva = {
        id: activa.id,
        especialidad: activa.especialidad,
        estado: activa.estado,
        sala_video_url: activa.sala_video_url,
        medico_nombre: med?.nombre_completo ?? "Médico",
      };
    }
  }

  if (role === "medico") {
    const { data } = await supabase
      .from("medicos")
      .select("id, disponible, disponible_desde, disponible_hasta, duracion_consulta, precio_consulta")
      .eq("user_id", user.id)
      .single();
    medico = data;

    if (data) {
      // Helper: traer nombres + fecha_nacimiento de pacientes
      async function fetchPacientes(ids: string[]) {
        if (ids.length === 0) return new Map<string, { id: string; nombre: string; nacimiento: string | null }>();
        const { data: pacs } = await supabase
          .from("pacientes")
          .select("id, user_id, nombre_completo, fecha_nacimiento")
          .in("user_id", ids);
        return new Map(
          (pacs ?? []).map((p) => [p.user_id, { id: p.id, nombre: p.nombre_completo, nacimiento: p.fecha_nacimiento }])
        );
      }

      // Consultas en espera
      const { data: esperando } = await supabase
        .from("consultas")
        .select("id, especialidad, estado, created_at, paciente_id, motivo_consulta")
        .eq("medico_id", data.id)
        .eq("estado", "esperando")
        .order("created_at", { ascending: true });

      if (esperando && esperando.length > 0) {
        const pacMap = await fetchPacientes(esperando.map((c) => c.paciente_id));
        consultasPendientes = esperando.map((c) => {
          const p = pacMap.get(c.paciente_id);
          return {
            id: c.id,
            especialidad: c.especialidad,
            estado: c.estado,
            created_at: c.created_at,
            paciente_nombre: p?.nombre ?? "Paciente",
            paciente_tabla_id: p?.id ?? null,
            motivo_consulta: c.motivo_consulta,
            fecha_nacimiento: p?.nacimiento ?? null,
          };
        });
      }

      // Consultas en curso
      const { data: enCurso } = await supabase
        .from("consultas")
        .select("id, especialidad, paciente_id, sala_video_url, motivo_consulta, sintomas, created_at")
        .eq("medico_id", data.id)
        .eq("estado", "en_curso")
        .order("created_at", { ascending: true });

      if (enCurso && enCurso.length > 0) {
        const pacMap = await fetchPacientes(enCurso.map((c) => c.paciente_id));
        consultasEnCurso = enCurso.map((c) => {
          const p = pacMap.get(c.paciente_id);
          return {
            id: c.id,
            especialidad: c.especialidad,
            paciente_nombre: p?.nombre ?? "Paciente",
            paciente_tabla_id: p?.id ?? null,
            sala_video_url: c.sala_video_url,
            motivo_consulta: c.motivo_consulta,
            sintomas: c.sintomas,
            created_at: c.created_at,
            fecha_nacimiento: p?.nacimiento ?? null,
          };
        });
      }

      // Turnos en espera del médico
      const { data: turnosEspera } = await supabase
        .from("turnos")
        .select("id, fecha, hora_inicio, paciente_id, estado")
        .eq("medico_id", data.id)
        .eq("estado", "en_espera")
        .order("hora_inicio", { ascending: true });

      if (turnosEspera && turnosEspera.length > 0) {
        const pacIdsEsp = [...new Set(turnosEspera.map((t) => t.paciente_id).filter(Boolean))];
        const { data: pacsEsp } = pacIdsEsp.length > 0
          ? await supabase.from("pacientes").select("id, nombre_completo").in("id", pacIdsEsp)
          : { data: [] };
        const nombresEsp = new Map((pacsEsp ?? []).map((p) => [p.id, p.nombre_completo]));
        turnosEsperaCompletos = turnosEspera.map((t) => ({
          id: t.id,
          fecha: t.fecha,
          hora_inicio: t.hora_inicio,
          paciente_nombre: nombresEsp.get(t.paciente_id) ?? "Paciente",
          especialidad: "",
        }));
      }

      // Completadas hoy + ingresos
      const hoy = new Date().toISOString().split("T")[0];
      const { data: compHoy } = await supabase
        .from("consultas")
        .select("id")
        .eq("medico_id", data.id)
        .eq("estado", "completada")
        .gte("created_at", hoy);
      completadasHoy = compHoy?.length ?? 0;
      ingresosHoy = completadasHoy * (data.precio_consulta ?? 0);

      // Contar modelos de agenda activos
      const { count: modelosActivosCount } = await supabase
        .from("agenda_modelos")
        .select("id", { count: "exact", head: true })
        .eq("medico_id", data.id)
        .eq("activo", true);
      numModelosActivos = modelosActivosCount ?? 0;

      // Turnos del día para agenda
      const { data: turnosHoyData } = await supabase
        .from("turnos")
        .select("id, fecha, hora_inicio, hora_fin, estado, paciente_id")
        .eq("medico_id", data.id)
        .eq("fecha", hoy)
        .in("estado", ["confirmado", "en_espera", "en_curso", "completado"])
        .order("hora_inicio", { ascending: true });

      if (turnosHoyData && turnosHoyData.length > 0) {
        const pacIdsTH = [...new Set(turnosHoyData.map((t) => t.paciente_id).filter(Boolean))];
        const { data: pacsTH } = pacIdsTH.length > 0
          ? await supabase.from("pacientes").select("id, nombre_completo").in("id", pacIdsTH)
          : { data: [] };
        const nombresTH = new Map((pacsTH ?? []).map((p) => [p.id, p.nombre_completo]));
        turnosHoy = turnosHoyData.map((t) => ({
          id: t.id, hora_inicio: t.hora_inicio, hora_fin: t.hora_fin,
          estado: t.estado, paciente_nombre: nombresTH.get(t.paciente_id) ?? "Paciente",
        }));
      }

      // Admin: todas las consultas
      const { data: todas } = await supabase
        .from("consultas")
        .select("id, especialidad, estado, created_at, paciente_id, medico_id, motivo_consulta, sintomas, sala_video_url")
        .eq("medico_id", data.id)
        .order("created_at", { ascending: false });

      if (todas && todas.length > 0) {
        const pacMap = await fetchPacientes([...new Set(todas.map((c) => c.paciente_id))]);
        todasLasConsultas = todas.map((c) => ({
          id: c.id,
          especialidad: c.especialidad,
          estado: c.estado,
          created_at: c.created_at,
          motivo_consulta: c.motivo_consulta,
          sintomas: c.sintomas,
          sala_video_url: c.sala_video_url,
          paciente_nombre: pacMap.get(c.paciente_id)?.nombre ?? "—",
          paciente_tabla_id: pacMap.get(c.paciente_id)?.id ?? null,
          medico_nombre: fullName,
        }));
      }
    }
  }

  // Initials for avatar
  const initials = fullName
    .split(" ")
    .map((w: string) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  // --- RENDER: MÉDICO ---
  if (role === "medico" && medico) {
    return (
      <div className="min-h-full bg-[#f8f9fa]">
        {/* Topbar */}
        <nav className="bg-white" style={{ borderBottom: "0.5px solid #e5e7eb" }}>
          <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
            <div className="flex items-center gap-5">
              <span className="text-lg font-medium text-gray-900">Uber Doc</span>
              <div className="flex items-center gap-1.5">
                <span
                  className={`inline-block h-2 w-2 rounded-full ${
                    medico.disponible ? "bg-[#1D9E75] animate-pulse" : "bg-gray-300"
                  }`}
                />
                <span className="text-xs text-gray-500">
                  {medico.disponible ? "Disponible" : "No disponible"}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-500">{fullName}</span>
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-xs font-medium text-gray-600">
                {initials}
              </div>
              <LogoutButton />
            </div>
          </div>
        </nav>

        <div className="mx-auto max-w-7xl px-6 py-6">
          {/* Métricas */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            {[
              { label: "Turnos hoy", value: turnosHoy.length, color: "text-[#378ADD]" },
              { label: "En espera", value: consultasPendientes.length, color: "text-amber-600" },
              { label: "En curso", value: consultasEnCurso.length, color: "text-[#1D9E75]" },
              { label: "Completadas hoy", value: completadasHoy, color: "text-gray-900" },
              {
                label: "Ingresos hoy",
                value: `$${ingresosHoy.toLocaleString("es-AR")}`,
                color: "text-gray-900",
              },
            ].map((m) => (
              <div
                key={m.label}
                className="rounded-xl bg-white p-5"
                style={{ border: "0.5px solid #e5e7eb" }}
              >
                <p className="text-xs font-medium tracking-wide text-gray-400">
                  {m.label.toUpperCase()}
                </p>
                <p className={`mt-1 text-2xl font-medium ${m.color}`}>
                  {m.value}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-6 flex gap-6">
            {/* Main column */}
            <div className="min-w-0 flex-1 space-y-5">
              {/* Turnos en espera */}
              <TurnosEnEspera
                turnos={turnosEsperaCompletos.map((t) => ({ ...t, entradoEn: Date.now() }))}
                medicoId={medico.id}
                hayEnCurso={consultasEnCurso.length > 0}
              />

              {/* Consulta activa */}
              <ConsultasEnCurso
                consultas={consultasEnCurso}
                medicoId={medico.id}
              />

              {/* Pacientes en espera */}
              <ConsultasPendientes
                consultas={consultasPendientes}
                medicoId={medico.id}
              />

              {/* Consulta inmediata */}
              <div className="rounded-xl bg-white" style={{ border: "0.5px solid #e5e7eb" }}>
                <div className="px-5 pt-5">
                  <div className="flex items-center gap-2">
                    <span className="text-base">⚡</span>
                    <p className="text-xs font-medium tracking-wide text-gray-400">CONSULTA INMEDIATA</p>
                  </div>
                  <p className="mt-1 text-sm text-gray-500">Pacientes te contactan ahora sin turno previo</p>
                </div>
                <div className="px-1 pb-1">
                  <DisponibilidadMedico
                    disponible={medico.disponible}
                    disponibleDesde={medico.disponible_desde}
                    disponibleHasta={medico.disponible_hasta}
                    duracionConsulta={medico.duracion_consulta}
                    precioConsulta={medico.precio_consulta}
                    pacientesEnEspera={consultasPendientes.length}
                  />
                </div>
              </div>

              {/* Turnos programados */}
              <div className="rounded-xl bg-white p-5" style={{ border: "0.5px solid #e5e7eb" }}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-base">📅</span>
                      <p className="text-xs font-medium tracking-wide text-gray-400">TURNOS PROGRAMADOS</p>
                    </div>
                    <p className="mt-1 text-sm text-gray-500">Pacientes reservan turno con anticipación</p>
                    <p className={`mt-1 text-xs ${numModelosActivos > 0 ? "text-[#1D9E75]" : "text-gray-400"}`}>
                      {numModelosActivos > 0
                        ? `${numModelosActivos} modelo${numModelosActivos !== 1 ? "s" : ""} activo${numModelosActivos !== 1 ? "s" : ""}`
                        : "Sin modelos configurados"
                      }
                    </p>
                  </div>
                  <Link
                    href="/medico/agenda"
                    className="shrink-0 rounded-lg bg-gray-100 px-3.5 py-2 text-xs font-medium text-gray-700 hover:bg-gray-200"
                  >
                    Configurar agenda →
                  </Link>
                </div>
              </div>
              {/* Agenda de hoy */}
              <AgendaHoy turnos={turnosHoy} />
            </div>

            {/* Sidebar */}
            <div className="hidden w-80 shrink-0 space-y-5 lg:block">
              {/* Admin */}
              <AdminConsultas consultas={todasLasConsultas} medicoId={medico.id} />
            </div>
          </div>

          {/* Admin mobile — below main content */}
          <div className="mt-5 lg:hidden">
            <AdminConsultas consultas={todasLasConsultas} medicoId={medico.id} />
          </div>
        </div>
      </div>
    );
  }

  // --- RENDER: PACIENTE ---
  return (
    <div className="min-h-full bg-[#f8f9fa]">
      <nav className="bg-white" style={{ borderBottom: "0.5px solid #e5e7eb" }}>
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
          <span className="text-lg font-medium text-gray-900">Uber Doc</span>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500">{fullName}</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-xs font-medium text-gray-600">
              {initials}
            </div>
            <LogoutButton />
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-3xl px-6 py-8">
        <h1 className="text-xl font-medium text-gray-900">Hola, {fullName}</h1>

        {/* Consulta activa */}
        {consultaActiva && (
          <div className="mt-6 rounded-xl bg-white p-5" style={{ border: "0.5px solid #e5e7eb" }}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">Tenés una consulta activa</p>
                <p className="mt-1 text-sm text-gray-500">{consultaActiva.especialidad} — Dr. {consultaActiva.medico_nombre}</p>
              </div>
              <Link
                href={consultaActiva.sala_video_url ? `/consulta/${consultaActiva.id}/video` : `/sala-espera/${consultaActiva.id}`}
                className="rounded-lg bg-[#1D9E75] px-4 py-2 text-sm font-medium text-white hover:bg-[#178a64] active:scale-95 active:opacity-80 transition-all duration-100"
              >
                {consultaActiva.sala_video_url ? "Reintentar videollamada" : "Ir a la sala de espera"}
              </Link>
            </div>
          </div>
        )}

        {/* Próximo turno */}
        {turnosPaciente.length > 0 && (
          <div className="mt-6 rounded-xl bg-white p-5" style={{ border: "0.5px solid #e5e7eb" }}>
            <div className="flex items-center gap-2">
              <span>📅</span>
              <p className="text-xs font-medium tracking-wide text-gray-400">TU PRÓXIMO TURNO</p>
            </div>
            <p className="mt-2 text-sm font-medium text-gray-900">
              {new Date(turnosPaciente[0].fecha + "T12:00:00").toLocaleDateString("es-AR", { weekday: "short", day: "2-digit", month: "long", timeZone: "America/Argentina/Buenos_Aires" })} · {turnosPaciente[0].hora_inicio.slice(0, 5)} hs
            </p>
            <p className="mt-0.5 text-sm text-gray-500">
              Dr. {turnosPaciente[0].medico_nombre} — {turnosPaciente[0].especialidad}
            </p>
          </div>
        )}

        {/* Acciones principales */}
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Link href="/clinica" className="rounded-xl bg-white p-6 transition hover:shadow-sm" style={{ border: "0.5px solid #e5e7eb" }}>
            <p className="text-2xl">🏥</p>
            <p className="mt-3 text-sm font-medium text-gray-900">Clínica Virtual</p>
            <p className="mt-1 text-xs text-gray-500">Consultá un médico ahora o agendá turno</p>
          </Link>
          <Link href="/documentos" className="rounded-xl bg-white p-6 transition hover:shadow-sm" style={{ border: "0.5px solid #e5e7eb" }}>
            <p className="text-2xl">📄</p>
            <p className="mt-3 text-sm font-medium text-gray-900">Mis documentos</p>
            <p className="mt-1 text-xs text-gray-500">Recetas, indicaciones y certificados</p>
          </Link>
        </div>

        {/* Mis turnos */}
        {turnosPaciente.length > 0 && (
          <div className="mt-6 rounded-xl bg-white p-5" style={{ border: "0.5px solid #e5e7eb" }}>
            <p className="text-xs font-medium tracking-wide text-gray-400">MIS TURNOS</p>
            <div className="mt-3 space-y-2">
              {turnosPaciente.map((t) => {
                const ahoraAR = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
                const hoyCheck = `${ahoraAR.getFullYear()}-${(ahoraAR.getMonth() + 1).toString().padStart(2, "0")}-${ahoraAR.getDate().toString().padStart(2, "0")}`;
                const [h, m] = t.hora_inicio.split(":").map(Number);
                const minTurno = h * 60 + m;
                const minAhora = ahoraAR.getHours() * 60 + ahoraAR.getMinutes();
                const esHoy = t.fecha === hoyCheck;
                const dentroDeRango = esHoy && minTurno - minAhora <= 15 && minTurno - minAhora >= -30;
                const mostrarSala = dentroDeRango || t.estado === "en_espera";

                return (
                  <div key={t.id} className="flex items-center justify-between rounded-lg p-3" style={{ border: mostrarSala ? "0.5px solid #1D9E75" : undefined, background: mostrarSala ? "#f0fdf4" : undefined }}>
                    <div>
                      <p className="text-sm text-gray-900">
                        {new Date(t.fecha + "T12:00:00").toLocaleDateString("es-AR", { weekday: "short", day: "2-digit", month: "short", timeZone: "America/Argentina/Buenos_Aires" })} · {t.hora_inicio.slice(0, 5)}
                      </p>
                      <p className="mt-0.5 text-xs text-gray-500">Dr. {t.medico_nombre} · {t.especialidad}</p>
                    </div>
                    {mostrarSala ? (
                      <Link
                        href={`/turno/${t.id}/espera`}
                        className="shrink-0 rounded-lg bg-[#1D9E75] px-4 py-2 text-xs font-medium text-white"
                      >
                        Ir a sala de espera
                      </Link>
                    ) : (
                      <span className="shrink-0 rounded-full bg-[#1D9E75]/10 px-2.5 py-1 text-[11px] font-medium text-[#1D9E75]">
                        Confirmado
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
