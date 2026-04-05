import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import LogoutButton from "./LogoutButton";
import DisponibilidadMedico from "./DisponibilidadMedico";
import DashboardMedicoProvider from "./DashboardMedicoProvider";
import ConsultasPendientes from "./ConsultasPendientes";
import ConsultasEnCurso from "./ConsultasEnCurso";
import TurnosEnEspera from "./TurnosEnEspera";
import AgendaHoy from "./AgendaHoy";
import MetricasMedico from "./MetricasMedico";
import MisTurnosPaciente from "./MisTurnosPaciente";
import HistorialInline from "./HistorialInline";
import NovaWidget from "./NovaWidget";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const fullName = user.user_metadata?.full_name || user.email;
  let role = user.user_metadata?.role;

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

  // AR timezone
  const ahoraAR = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
  const pad = (n: number) => n.toString().padStart(2, "0");
  const hoy = `${ahoraAR.getFullYear()}-${pad(ahoraAR.getMonth() + 1)}-${pad(ahoraAR.getDate())}`;

  // ─── MÉDICO DATA ───
  let medico: {
    id: string; disponible: boolean; disponible_desde: string | null;
    disponible_hasta: string | null; duracion_consulta: number; precio_consulta: number;
  } | null = null;

  let consultasPendientes: {
    id: string; especialidad: string; estado: string; created_at: string;
    paciente_nombre: string; paciente_tabla_id: string | null;
    motivo_consulta: string | null; fecha_nacimiento: string | null;
  }[] = [];

  let consultasEnCurso: {
    id: string; especialidad: string; paciente_nombre: string; paciente_tabla_id: string | null;
    sala_video_url: string | null; motivo_consulta: string | null;
    sintomas: string[] | null; created_at: string; fecha_nacimiento: string | null;
  }[] = [];

  let completadasHoy = 0;
  let ingresosHoy = 0;
  let turnosEsperaCompletos: { id: string; fecha: string; hora_inicio: string; paciente_nombre: string; paciente_tabla_id: string | null; especialidad: string }[] = [];
  let turnosHoy: { id: string; hora_inicio: string; hora_fin: string; estado: string; paciente_nombre: string }[] = [];
  let turnoEnCurso: { id: string; hora_inicio: string; paciente_nombre: string } | null = null;
  let modelosActivosList: { id: string; nombre: string }[] = [];

  // ─── PACIENTE DATA ───
  let consultaActiva: {
    id: string; especialidad: string; estado: string;
    sala_video_url: string | null; medico_nombre: string;
  } | null = null;

  let turnosPaciente: {
    id: string; fecha: string; hora_inicio: string; estado: string;
    especialidad: string; medico_nombre: string;
  }[] = [];

  let turnoEnCursoPaciente: {
    id: string; medico_nombre: string; hora_inicio: string;
  } | null = null;

  if (role === "paciente") {
    const { data: pacienteData } = await supabase
      .from("pacientes").select("id").eq("user_id", user.id).maybeSingle();

    if (pacienteData) {
      const { data: turnosData } = await supabase
        .from("turnos")
        .select("id, fecha, hora_inicio, estado, medico_id")
        .eq("paciente_id", pacienteData.id)
        .in("estado", ["confirmado", "en_espera"])
        .gte("fecha", hoy)
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
            id: t.id, fecha: t.fecha, hora_inicio: t.hora_inicio, estado: t.estado,
            especialidad: med?.especialidad ?? "", medico_nombre: med?.nombre_completo ?? "Médico",
          };
        });
      }

      // Turno en curso del paciente
      const { data: turnoECPac } = await supabase
        .from("turnos").select("id, hora_inicio, medico_id")
        .eq("paciente_id", pacienteData.id).eq("estado", "en_curso")
        .limit(1).maybeSingle();

      if (turnoECPac) {
        const { data: medEC } = await supabase
          .from("medicos").select("nombre_completo").eq("id", turnoECPac.medico_id).maybeSingle();
        turnoEnCursoPaciente = {
          id: turnoECPac.id, hora_inicio: turnoECPac.hora_inicio,
          medico_nombre: medEC?.nombre_completo ?? "Médico",
        };
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
        .from("medicos").select("nombre_completo").eq("id", activa.medico_id).single();
      consultaActiva = {
        id: activa.id, especialidad: activa.especialidad, estado: activa.estado,
        sala_video_url: activa.sala_video_url, medico_nombre: med?.nombre_completo ?? "Médico",
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
      async function fetchPacientes(ids: string[]) {
        if (ids.length === 0) return new Map<string, { id: string; nombre: string; nacimiento: string | null }>();
        const { data: pacs } = await supabase
          .from("pacientes").select("id, user_id, nombre_completo, fecha_nacimiento").in("user_id", ids);
        return new Map(
          (pacs ?? []).map((p) => [p.user_id, { id: p.id, nombre: p.nombre_completo, nacimiento: p.fecha_nacimiento }])
        );
      }

      // Consultas en espera
      const { data: esperando } = await supabase
        .from("consultas")
        .select("id, especialidad, estado, created_at, paciente_id, motivo_consulta")
        .eq("medico_id", data.id).eq("estado", "esperando")
        .order("created_at", { ascending: true });

      if (esperando && esperando.length > 0) {
        const pacMap = await fetchPacientes(esperando.map((c) => c.paciente_id));
        consultasPendientes = esperando.map((c) => {
          const p = pacMap.get(c.paciente_id);
          return {
            id: c.id, especialidad: c.especialidad, estado: c.estado, created_at: c.created_at,
            paciente_nombre: p?.nombre ?? "Paciente", paciente_tabla_id: p?.id ?? null,
            motivo_consulta: c.motivo_consulta, fecha_nacimiento: p?.nacimiento ?? null,
          };
        });
      }

      // Consultas aceptadas + en curso
      const { data: enCurso } = await supabase
        .from("consultas")
        .select("id, especialidad, paciente_id, sala_video_url, motivo_consulta, sintomas, created_at")
        .eq("medico_id", data.id).in("estado", ["aceptada", "en_curso"])
        .order("created_at", { ascending: true });

      if (enCurso && enCurso.length > 0) {
        const pacMap = await fetchPacientes(enCurso.map((c) => c.paciente_id));
        consultasEnCurso = enCurso.map((c) => {
          const p = pacMap.get(c.paciente_id);
          return {
            id: c.id, especialidad: c.especialidad, paciente_nombre: p?.nombre ?? "Paciente",
            paciente_tabla_id: p?.id ?? null, sala_video_url: c.sala_video_url,
            motivo_consulta: c.motivo_consulta, sintomas: c.sintomas,
            created_at: c.created_at, fecha_nacimiento: p?.nacimiento ?? null,
          };
        });
      }

      // Turnos en espera
      const { data: turnosEspera } = await supabase
        .from("turnos")
        .select("id, fecha, hora_inicio, paciente_id, estado")
        .eq("medico_id", data.id).eq("estado", "en_espera")
        .order("hora_inicio", { ascending: true });

      if (turnosEspera && turnosEspera.length > 0) {
        const pacIdsEsp = [...new Set(turnosEspera.map((t) => t.paciente_id).filter(Boolean))];
        const { data: pacsEsp } = pacIdsEsp.length > 0
          ? await supabase.from("pacientes").select("id, nombre_completo").in("id", pacIdsEsp)
          : { data: [] };
        const nombresEsp = new Map((pacsEsp ?? []).map((p) => [p.id, p.nombre_completo]));
        turnosEsperaCompletos = turnosEspera.map((t) => ({
          id: t.id, fecha: t.fecha, hora_inicio: t.hora_inicio,
          paciente_nombre: nombresEsp.get(t.paciente_id) ?? "Paciente",
          paciente_tabla_id: t.paciente_id, especialidad: "",
        }));
      }

      // Turno en curso
      const { data: turnoEC } = await supabase
        .from("turnos").select("id, hora_inicio, paciente_id")
        .eq("medico_id", data.id).eq("estado", "en_curso")
        .limit(1).maybeSingle();

      if (turnoEC) {
        const { data: pacEC } = await supabase
          .from("pacientes").select("nombre_completo").eq("id", turnoEC.paciente_id).maybeSingle();
        turnoEnCurso = {
          id: turnoEC.id, hora_inicio: turnoEC.hora_inicio,
          paciente_nombre: pacEC?.nombre_completo ?? "Paciente",
        };
      }

      // Completadas hoy (consultas + turnos)
      const { data: compConsHoy } = await supabase
        .from("consultas").select("id")
        .eq("medico_id", data.id).eq("estado", "completada").gte("created_at", hoy);
      const { data: compTurnosHoy } = await supabase
        .from("turnos").select("id")
        .eq("medico_id", data.id).eq("estado", "completado").eq("fecha", hoy);
      completadasHoy = (compConsHoy?.length ?? 0) + (compTurnosHoy?.length ?? 0);
      ingresosHoy = completadasHoy * (data.precio_consulta ?? 0);

      // Modelos activos (lista para sidebar)
      const { data: modelosData } = await supabase
        .from("agenda_modelos").select("id, nombre")
        .eq("medico_id", data.id).eq("activo", true).order("nombre");
      modelosActivosList = modelosData ?? [];

      // Turnos del día para agenda
      const { data: turnosHoyData } = await supabase
        .from("turnos")
        .select("id, fecha, hora_inicio, hora_fin, estado, paciente_id")
        .eq("medico_id", data.id).eq("fecha", hoy)
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

    }
  }

  const initials = fullName.split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase();
  const hayAlgoEnCurso = consultasEnCurso.length > 0 || turnoEnCurso !== null;
  const hayTurnosActivosHoy = turnosHoy.some((t) => t.estado === "confirmado" || t.estado === "en_espera");
  const consultaInactiva = !medico?.disponible || hayTurnosActivosHoy;
  const hayUrgenciaTurnos = turnosEsperaCompletos.length > 0 || turnoEnCurso !== null;
  const hayUrgenciaConsulta = consultasPendientes.length > 0 || consultasEnCurso.length > 0;

  // ═══════════════════════════════════════
  // RENDER: MÉDICO
  // ═══════════════════════════════════════
  if (role === "medico" && medico) {
    const capacidadCI = (() => {
      const d = medico.disponible_desde ?? "08:00";
      const h = medico.disponible_hasta ?? "18:00";
      const [hD, mD] = d.split(":").map(Number);
      const [hH, mH] = h.split(":").map(Number);
      const mins = hH * 60 + mH - (hD * 60 + mD);
      return mins > 0 ? Math.floor(mins / medico.duracion_consulta) : 0;
    })();

    // ── Hemisferios con estructura idéntica ──
    const hemiPad = "space-y-4 rounded-xl bg-white p-5";
    const hemiStyle = { border: "0.5px solid #e5e7eb" } as const;
    const titleClass = "text-[13px] font-semibold tracking-wide text-gray-900 uppercase";
    const footerClass = "flex items-center justify-between border-t border-gray-100 pt-3 mt-4";
    const actionClass = "text-sm font-medium text-[#1D9E75] hover:underline transition-colors";

    const colTurnos = (
      <div className={hemiPad} style={hemiStyle}>
        {/* Título */}
        <h2 className={titleClass}>Turnos programados</h2>

        {/* Sub-métrica */}
        <p className="text-xs text-gray-500">
          {turnosHoy.length} turno{turnosHoy.length !== 1 ? "s" : ""} hoy
        </p>

        {/* Mi agenda */}
        <div className="rounded-xl bg-white px-5 py-3" style={{ border: "0.5px solid #e5e7eb" }}>
          <Link href="/medico/agenda" className={actionClass}>Mi agenda →</Link>
        </div>

        {/* Zona urgencia */}
        <TurnosEnEspera
          medicoId={medico.id}
          hayEnCurso={hayAlgoEnCurso}
        />

        {turnoEnCurso && (
          <div className="rounded-xl bg-white p-4" style={{ border: "1px solid #378ADD" }}>
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-[#378ADD]" />
                  <span className="text-xs font-medium tracking-wide text-[#378ADD]">TURNO EN CURSO</span>
                </div>
                <p className="mt-2 text-[15px] font-medium text-gray-900">{turnoEnCurso.paciente_nombre}</p>
                <p className="mt-0.5 text-sm text-gray-500">Turno de las {turnoEnCurso.hora_inicio.slice(0, 5)} hs</p>
              </div>
              <Link
                href={`/turno/${turnoEnCurso.id}/video`}
                className="shrink-0 rounded-lg bg-[#378ADD] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#2d75c4] active:scale-95 transition-all duration-100"
              >
                Ver consulta
              </Link>
            </div>
          </div>
        )}

        {/* Lista del día */}
        <AgendaHoy turnos={turnosHoy} />

        {/* Pie */}
        <div className={footerClass + " justify-end"}>
          <HistorialInline medicoId={medico.id} tipo="turno" />
        </div>
      </div>
    );

    const colConsulta = (
      <div className={`${hemiPad} ${consultaInactiva ? "opacity-60" : ""}`} style={hemiStyle}>
        {/* Título */}
        <h2 className={titleClass}>Consulta inmediata</h2>

        {/* Sub-métrica / estado + toggle */}
        <div className="rounded-xl bg-white" style={{ border: "0.5px solid #e5e7eb" }}>
          <DisponibilidadMedico
            medicoId={medico.id}
            disponible={medico.disponible}
            disponibleDesde={medico.disponible_desde}
            disponibleHasta={medico.disponible_hasta}
            duracionConsulta={medico.duracion_consulta}
            precioConsulta={medico.precio_consulta}
            pacientesEnEspera={consultasPendientes.length}
          />
        </div>

        {/* Zona urgencia / contenido */}
        <ConsultasEnCurso medicoId={medico.id} />
        {consultaInactiva ? (
          <div className="rounded-xl px-5 py-8 text-center" style={{ background: "#f8f9fa", border: "0.5px solid #e5e7eb" }}>
            <p className="text-sm text-gray-400">Consulta inmediata inactiva</p>
          </div>
        ) : (
          <ConsultasPendientes medicoId={medico.id} />
        )}

        {/* Pie */}
        <div className={footerClass + " justify-end"}>
          <HistorialInline medicoId={medico.id} tipo="consulta" />
        </div>
      </div>
    );

    return (
      <DashboardMedicoProvider
        medicoId={medico.id}
        initialPendientes={consultasPendientes}
        initialEnCurso={consultasEnCurso}
        initialTurnosEspera={turnosEsperaCompletos.map((t) => ({ ...t, entradoEn: Date.now() }))}
      >
        <div className="min-h-full bg-[#f8f9fa]">
          {/* Topbar */}
          <nav className="bg-white" style={{ borderBottom: "0.5px solid #e5e7eb" }}>
            <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
              <div className="flex items-center gap-5">
                <span className="text-lg font-medium text-gray-900">Docto</span>
                <div className="flex items-center gap-1.5">
                  <span className={`inline-block h-2 w-2 rounded-full ${medico.disponible ? "bg-[#1D9E75] animate-pulse" : "bg-gray-300"}`} />
                  <span className="text-xs text-gray-500">{medico.disponible ? "Disponible" : "No disponible"}</span>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <Link href="/medico/nova" className="hidden text-sm font-medium text-[#1D9E75] hover:text-[#178a64] transition-colors lg:inline-block">
                  🤖 Nova
                </Link>
                <span className="text-sm text-gray-500">{fullName}</span>
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-xs font-medium text-gray-600">{initials}</div>
                <LogoutButton />
              </div>
            </div>
          </nav>

          <div className="mx-auto max-w-7xl px-6 py-6">
            {/* Nova widget */}
            <NovaWidget
              nombreMedico={fullName}
              turnosHoy={turnosHoy.length}
            />

            {/* Métricas full width */}
            <MetricasMedico
              medicoId={medico.id}
              inicial={{
                turnos: turnosHoy.length,
                enEspera: turnosEsperaCompletos.length + consultasPendientes.length,
                completadas: completadasHoy,
                ingresos: ingresosHoy,
              }}
            />

            {/* Dos hemisferios — desktop */}
            <div className="mt-6 hidden gap-6 lg:grid lg:grid-cols-2 lg:items-start">
              {colTurnos}
              {colConsulta}
            </div>

            {/* Mobile — urgencia primero */}
            <div className="mt-6 space-y-8 lg:hidden">
              {hayUrgenciaConsulta && !hayUrgenciaTurnos ? (
                <>{colConsulta}{colTurnos}</>
              ) : (
                <>{colTurnos}{colConsulta}</>
              )}
            </div>
          </div>
        </div>
      </DashboardMedicoProvider>
    );
  }

  // ═══════════════════════════════════════
  // RENDER: PACIENTE
  // ═══════════════════════════════════════
  const hayUrgenciaPaciente = turnoEnCursoPaciente || consultaActiva || turnosPaciente.some((t) => t.estado === "en_espera");

  return (
    <div className="min-h-full bg-[#f8f9fa]">
      <nav className="bg-white" style={{ borderBottom: "0.5px solid #e5e7eb" }}>
        <div className="mx-auto flex h-14 max-w-lg items-center justify-between px-6">
          <span className="text-lg font-medium text-gray-900">Docto</span>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500">{fullName}</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-xs font-medium text-gray-600">{initials}</div>
            <LogoutButton />
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-lg px-6 py-8">
        {/* ── ESTADO 1: Turno en curso (programado) ── */}
        {turnoEnCursoPaciente && (
          <div className="mb-5 rounded-xl bg-white p-5" style={{ border: "1px solid #378ADD" }}>
            <div className="flex items-center gap-2">
              <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-[#378ADD]" />
              <span className="text-xs font-medium tracking-wide text-[#378ADD]">CONSULTA EN CURSO</span>
            </div>
            <p className="mt-3 text-[15px] font-medium text-gray-900">
              Tu consulta con Dr. {turnoEnCursoPaciente.medico_nombre} está en curso
            </p>
            <p className="mt-0.5 text-sm text-gray-500">Turno de las {turnoEnCursoPaciente.hora_inicio.slice(0, 5)} hs</p>
            <Link
              href={`/turno/${turnoEnCursoPaciente.id}/video`}
              className="mt-4 block w-full rounded-lg bg-[#378ADD] py-2.5 text-center text-sm font-medium text-white hover:bg-[#2d75c4] active:scale-[0.98] transition-all duration-100"
            >
              Volver a la videollamada
            </Link>
          </div>
        )}

        {/* ── ESTADO 1: Consulta inmediata activa ── */}
        {consultaActiva && !turnoEnCursoPaciente && (
          <div
            className="mb-5 rounded-xl bg-white p-5"
            style={{ border: `1px solid ${consultaActiva.estado === "en_curso" ? "#378ADD" : "#1D9E75"}` }}
          >
            <div className="flex items-center gap-2">
              <span
                className="inline-block h-2.5 w-2.5 animate-pulse rounded-full"
                style={{ background: consultaActiva.estado === "en_curso" ? "#378ADD" : "#1D9E75" }}
              />
              <span
                className="text-xs font-medium tracking-wide"
                style={{ color: consultaActiva.estado === "en_curso" ? "#378ADD" : "#1D9E75" }}
              >
                {consultaActiva.estado === "en_curso" ? "CONSULTA EN CURSO" : "EN SALA DE ESPERA"}
              </span>
            </div>
            <p className="mt-3 text-[15px] font-medium text-gray-900">
              {consultaActiva.estado === "en_curso"
                ? `Tu consulta con Dr. ${consultaActiva.medico_nombre} está en curso`
                : "Tu médico te atenderá en breve"}
            </p>
            <p className="mt-0.5 text-sm text-gray-500">{consultaActiva.especialidad} — Dr. {consultaActiva.medico_nombre}</p>
            <Link
              href={consultaActiva.estado === "en_curso" ? `/consulta/${consultaActiva.id}/video` : `/sala-espera/${consultaActiva.id}`}
              className="mt-4 block w-full rounded-lg py-2.5 text-center text-sm font-medium text-white active:scale-[0.98] transition-all duration-100"
              style={{ background: consultaActiva.estado === "en_curso" ? "#378ADD" : "#1D9E75" }}
            >
              {consultaActiva.estado === "en_curso" ? "Volver a la videollamada" : "Ir a la sala de espera"}
            </Link>
          </div>
        )}

        {/* ── ESTADO 1b: Turno en espera (esperando al médico) ── */}
        {!turnoEnCursoPaciente && !consultaActiva && (() => {
          const enEspera = turnosPaciente.find((t) => t.estado === "en_espera");
          if (!enEspera) return null;
          return (
            <div className="mb-5 rounded-xl bg-white p-5" style={{ border: "1px solid #1D9E75" }}>
              <div className="flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-[#1D9E75]" />
                <span className="text-xs font-medium tracking-wide text-[#1D9E75]">EN SALA DE ESPERA</span>
              </div>
              <p className="mt-3 text-[15px] font-medium text-gray-900">Tu médico te atenderá en breve</p>
              <p className="mt-0.5 text-sm text-gray-500">Dr. {enEspera.medico_nombre} · {enEspera.hora_inicio.slice(0, 5)} hs</p>
              <Link
                href={`/turno/${enEspera.id}/espera`}
                className="mt-4 block w-full rounded-lg bg-[#1D9E75] py-2.5 text-center text-sm font-medium text-white hover:bg-[#178a64] active:scale-[0.98] transition-all duration-100"
              >
                Ir a sala de espera
              </Link>
            </div>
          );
        })()}

        {/* ── ESTADO 2: Próximo turno hoy ── */}
        {!hayUrgenciaPaciente && (() => {
          const proximoHoy = turnosPaciente.find((t) => {
            if (t.fecha !== hoy || t.estado !== "confirmado") return false;
            const [h, m] = t.hora_inicio.split(":").map(Number);
            const minTurno = h * 60 + m;
            const minAhora = ahoraAR.getHours() * 60 + ahoraAR.getMinutes();
            return minTurno - minAhora > -30;
          });
          if (!proximoHoy) return null;

          const [h, m] = proximoHoy.hora_inicio.split(":").map(Number);
          const minTurno = h * 60 + m;
          const minAhora = ahoraAR.getHours() * 60 + ahoraAR.getMinutes();
          const mostrarSala = minTurno - minAhora <= 15;

          return (
            <div className="mb-5 rounded-xl bg-white p-5" style={{ border: "0.5px solid #e5e7eb" }}>
              <p className="text-xs font-medium tracking-wide text-gray-400">TU PRÓXIMO TURNO</p>
              <p className="mt-2 text-sm font-medium text-gray-900">
                Hoy a las {proximoHoy.hora_inicio.slice(0, 5)} hs con Dr. {proximoHoy.medico_nombre}
              </p>
              <p className="mt-0.5 text-xs text-gray-500">{proximoHoy.especialidad}</p>
              {mostrarSala && (
                <Link
                  href={`/turno/${proximoHoy.id}/espera`}
                  className="mt-3 block w-full rounded-lg bg-[#1D9E75] py-2.5 text-center text-sm font-medium text-white hover:bg-[#178a64] active:scale-[0.98] transition-all duration-100"
                >
                  Ir a sala de espera
                </Link>
              )}
            </div>
          );
        })()}

        {/* ── Acciones principales ── */}
        <div className="grid gap-4 grid-cols-2">
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

        {/* ── Mis turnos ── */}
        <div className="mt-5">
          <MisTurnosPaciente turnos={turnosPaciente} />
        </div>
      </main>
    </div>
  );
}
