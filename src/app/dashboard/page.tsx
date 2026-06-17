export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import LinkNav from "@/components/ui/LinkNav";
import AppNavbar from "@/components/AppNavbar";
import DashboardMedicoProvider from "./DashboardMedicoProvider";
import BloqueConsultaInmediata from "./BloqueConsultaInmediata";
import TurnosEnEspera from "./TurnosEnEspera";
import AgendaHoy from "./AgendaHoy";
import MetricasMedico from "./MetricasMedico";
import MisTurnosPaciente from "./MisTurnosPaciente";
import HistorialInline from "./HistorialInline";
import NovaWidget from "./NovaWidget";
import { BadgeEsperando, BotonSilenciar, PopupEsperando, PopupPagada } from "./NotificacionMedicoUI";
import { Building2 } from "lucide-react";
import CardConsultorio from "./CardConsultorio";
import PantallaVerificacion from "./PantallaVerificacion";
import PantallaIdentidad from "./PantallaIdentidad";
import PanelProgresoPerfil from "./PanelProgresoPerfil";
import BannerMercadoPago from "./BannerMercadoPago";
import BannerFirmaElectronica from "./BannerFirmaElectronica";
import AvatarDropdown from "./AvatarDropdown";
import BotonPush from "@/components/BotonPush";
import PresenciaTracker from "@/components/PresenciaTracker";
import ModalPushMedico from "./ModalPushMedico";
import { getFlag } from "@/lib/feature-flags";
import { formatNombreMedico } from "@/lib/utils/texto";
import { perfilMedicoCompleto } from "@/lib/perfil-medico";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ aviso?: string; from?: string; identidad?: string }>;
}) {
  const { aviso, from, identidad } = await searchParams;
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

  // Admin puro (sin rol medico/paciente) → redirigir a panel admin
  if (!role || (role !== "medico" && role !== "paciente")) {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const adminDb = createAdminClient();
    const { data: esAdmin } = await adminDb
      .from("admin_users")
      .select("id")
      .eq("user_id", user.id)
      .eq("activo", true)
      .maybeSingle();
    if (esAdmin) redirect("/admin");
  }

  // Feature flags para UI
  const [flagNovaAi, flagCiGlobal, flagIdentidadGate] = await Promise.all([
    getFlag("nova_ai"),
    getFlag("consulta_inmediata_global"),
    getFlag("identidad_gate_activa"),
  ]);

  // AR timezone
  const ahoraAR = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
  const pad = (n: number) => n.toString().padStart(2, "0");
  const hoy = `${ahoraAR.getFullYear()}-${pad(ahoraAR.getMonth() + 1)}-${pad(ahoraAR.getDate())}`;

  // ─── MÉDICO DATA ───
  let medico: {
    id: string; disponible: boolean; disponible_desde: string | null;
    disponible_hasta: string | null; duracion_consulta: number; precio_consulta: number;
    oculto_clinica: boolean; visible_consultorio_particular: boolean; verificado: boolean; estado_registro: string;
    especialidad: string; tipo_matricula: string; numero_matricula: string;
    foto_credencial_url: string | null; slug: string | null;
    nombre_completo: string; telefono: string | null; foto_url: string | null;
    domicilio_consultorio: string | null; perfil_completo: boolean;
    identidad_validada: boolean; didit_status: string | null;
  } | null = null;

  let consultasPendientes: {
    id: string; especialidad: string; estado: string; created_at: string;
    paciente_nombre: string; paciente_tabla_id: string | null;
    motivo_consulta: string | null; fecha_nacimiento: string | null;
    canal_origen?: string;
  }[] = [];

  let consultasEnCurso: {
    id: string; especialidad: string; estado: string; paciente_nombre: string; paciente_tabla_id: string | null;
    sala_video_url: string | null; motivo_consulta: string | null;
    sintomas: string[] | null; created_at: string; fecha_nacimiento: string | null;
    canal_origen?: string;
  }[] = [];

  let completadasHoy = 0;
  let ingresosHoy = 0;
  let netoHoy = 0;
  let turnosEsperaCompletos: { id: string; fecha: string; hora_inicio: string; paciente_nombre: string; paciente_tabla_id: string | null; especialidad: string; canal_origen?: string }[] = [];
  let turnosHoy: { id: string; hora_inicio: string; hora_fin: string; estado: string; paciente_nombre: string }[] = [];
  let proximosTurnos: { id: string; fecha: string; hora_inicio: string; hora_fin: string; estado: string; paciente_nombre: string }[] = [];
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
      .in("estado", ["aceptada", "pagada", "en_curso"])
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
      .select("id, disponible, disponible_desde, disponible_hasta, duracion_consulta, precio_consulta, oculto_clinica, visible_consultorio_particular, verificado, estado_registro, especialidad, tipo_matricula, numero_matricula, foto_credencial_url, slug, nombre_completo, telefono, foto_url, domicilio_consultorio, perfil_completo, identidad_validada, didit_status, es_cuenta_test")
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
        .select("id, especialidad, estado, created_at, paciente_id, motivo_consulta, canal_origen")
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
            canal_origen: (c as { canal_origen?: string }).canal_origen ?? undefined,
          };
        });
      }

      // Consultas aceptadas + en curso
      const { data: enCurso } = await supabase
        .from("consultas")
        .select("id, especialidad, estado, paciente_id, sala_video_url, motivo_consulta, sintomas, created_at, canal_origen")
        .eq("medico_id", data.id).in("estado", ["aceptada", "pagada", "en_curso"])
        .order("created_at", { ascending: true });

      if (enCurso && enCurso.length > 0) {
        const pacMap = await fetchPacientes(enCurso.map((c) => c.paciente_id));
        consultasEnCurso = enCurso.map((c) => {
          const p = pacMap.get(c.paciente_id);
          return {
            id: c.id, especialidad: c.especialidad, estado: c.estado,
            paciente_nombre: p?.nombre ?? "Paciente",
            paciente_tabla_id: p?.id ?? null, sala_video_url: c.sala_video_url,
            motivo_consulta: c.motivo_consulta, sintomas: c.sintomas,
            created_at: c.created_at, fecha_nacimiento: p?.nacimiento ?? null,
            canal_origen: (c as { canal_origen?: string }).canal_origen ?? undefined,
          };
        });
      }

      // Turnos en espera
      const { data: turnosEspera } = await supabase
        .from("turnos")
        .select("id, fecha, hora_inicio, paciente_id, estado, canal_origen")
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
          canal_origen: (t as { canal_origen?: string }).canal_origen,
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
        .from("consultas").select("id, monto, comision_docto_pct")
        .eq("medico_id", data.id).eq("estado", "completada").gte("created_at", hoy);
      const { data: compTurnosHoy } = await supabase
        .from("turnos").select("id, monto, comision_docto_pct")
        .eq("medico_id", data.id).eq("estado", "completado").eq("fecha", hoy);
      completadasHoy = (compConsHoy?.length ?? 0) + (compTurnosHoy?.length ?? 0);
      // Ingresos = suma de montos reales facturados; Neto = menos comisión Docto
      // por consulta (default 5%). MISMA fórmula que fetchMetricasMedico (actions.ts),
      // así "Hoy" no difiere entre la carga de la página y el botón.
      const _compHoy = [...(compConsHoy ?? []), ...(compTurnosHoy ?? [])];
      ingresosHoy = _compHoy.reduce((s, x) => s + (x.monto ?? 0), 0);
      netoHoy = Math.round(
        _compHoy.reduce((s, x) => s + (x.monto ?? 0) * (1 - (Number(x.comision_docto_pct) || 5) / 100), 0)
      );

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

      // Próximos turnos (después de hoy, max 5)
      const { data: proximosData } = await supabase
        .from("turnos")
        .select("id, fecha, hora_inicio, hora_fin, estado, paciente_id")
        .eq("medico_id", data.id).gt("fecha", hoy)
        .in("estado", ["confirmado", "en_espera"])
        .order("fecha", { ascending: true })
        .order("hora_inicio", { ascending: true })
        .limit(5);

      if (proximosData && proximosData.length > 0) {
        const pacIdsP = [...new Set(proximosData.map((t) => t.paciente_id).filter(Boolean))];
        const { data: pacsP } = pacIdsP.length > 0
          ? await supabase.from("pacientes").select("id, nombre_completo").in("id", pacIdsP)
          : { data: [] };
        const nombresP = new Map((pacsP ?? []).map((p) => [p.id, p.nombre_completo]));
        proximosTurnos = proximosData.map((t) => ({
          id: t.id, fecha: t.fecha, hora_inicio: t.hora_inicio, hora_fin: t.hora_fin,
          estado: t.estado, paciente_nombre: nombresP.get(t.paciente_id) ?? "Paciente",
        }));
      }

    }
  }

  // MP account + firma electrónica check for banners
  let mpConectado = false;
  let firmaConfigurada = false;
  if (role === "medico" && medico) {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const adminDb = createAdminClient();
    const [mpRes, firmaRes] = await Promise.all([
      adminDb
        .from("medicos_mp_accounts")
        .select("estado")
        .eq("medico_id", medico.id)
        .eq("estado", "activo")
        .maybeSingle(),
      adminDb
        .from("medico_claves")
        .select("id")
        .eq("medico_id", medico.id)
        .maybeSingle(),
    ]);
    mpConectado = !!mpRes.data;
    firmaConfigurada = !!firmaRes.data;
  }

  const initials = fullName.split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase();
  const hayAlgoEnCurso = consultasEnCurso.length > 0 || turnoEnCurso !== null;
  const hayTurnosActivosHoy = turnosHoy.some((t) => t.estado === "en_curso");
  const hayUrgenciaTurnos = turnosEsperaCompletos.length > 0 || turnoEnCurso !== null;
  const hayUrgenciaConsulta = consultasPendientes.length > 0 || consultasEnCurso.length > 0;

  // ═══════════════════════════════════════
  // RENDER: MÉDICO
  // ═══════════════════════════════════════
  if (role === "medico" && medico && !medico.verificado) {
    return (
      <PantallaVerificacion
        fullName={fullName}
        email={user.email ?? ""}
        estadoRegistro={medico.estado_registro}
        especialidad={medico.especialidad}
        tipoMatricula={medico.tipo_matricula}
        numeroMatricula={medico.numero_matricula}
        fotoCredencialUrl={medico.foto_credencial_url}
        userId={user.id}
      />
    );
  }

  // Gate de identidad biométrica (Didit). Detrás de feature flag para no
  // bloquear médicos antes de tiempo. Va DESPUÉS de la verificación de matrícula.
  if (
    role === "medico" &&
    medico &&
    flagIdentidadGate &&
    !medico.identidad_validada
  ) {
    return (
      <PantallaIdentidad
        diditStatus={medico.didit_status}
        recienVolvio={identidad === "verificada"}
        userId={user.id}
      />
    );
  }

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
    const actionClass = "text-sm font-medium text-[#378ADD] hover:underline transition-colors";

    const colTurnos = (
      <div className={hemiPad} style={{ ...hemiStyle, borderLeft: "4px solid #378ADD", boxShadow: "0 1px 2px 0 rgba(0,0,0,0.05)" }}>
        {/* Título */}
        <div className="flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#378ADD]" />
          <h2 className="text-sm font-semibold tracking-wide uppercase text-[#378ADD]">Turnos programados</h2>
        </div>

        {/* Sub-métrica */}
        <p className="text-sm text-gray-500">
          {turnosHoy.length} turno{turnosHoy.length !== 1 ? "s" : ""} hoy
        </p>

        {/* Mi agenda */}
        <LinkNav href="/medico/agenda" className="w-full justify-center rounded-lg px-5 py-2.5 text-sm font-medium text-[#378ADD] transition-colors hover:bg-[#378ADD]/5" style={{ border: "1px solid #378ADD" }}>
          Mi agenda →
        </LinkNav>

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
                <p className="mt-2 text-lg font-medium text-gray-900">{turnoEnCurso.paciente_nombre}</p>
                <p className="mt-0.5 text-sm text-gray-500">Turno de las {turnoEnCurso.hora_inicio.slice(0, 5)} hs</p>
              </div>
              <Link
                href={`/turno/${turnoEnCurso.id}/video`}
                className="shrink-0 rounded-lg bg-[#378ADD] px-6 py-3 text-base font-medium text-white hover:bg-[#2d75c4] active:scale-95 transition-all duration-100"
              >
                Ver consulta
              </Link>
            </div>
          </div>
        )}

        {/* Lista del día */}
        <AgendaHoy turnos={turnosHoy} proximosTurnos={proximosTurnos} />

        {/* Pie — historial full-width */}
        <div className="border-t border-gray-100 pt-3 mt-4">
          <HistorialInline medicoId={medico.id} tipo="turno" />
        </div>
      </div>
    );

    // Completitud REAL del perfil (no el flag DB `perfil_completo`, que quedaba
    // desactualizado). Gobierna el gate del toggle "disponible" y el banner.
    const perfilCompletoReal = perfilMedicoCompleto(medico);

    const colConsulta = (
      <BloqueConsultaInmediata
        medicoId={medico.id}
        disponibleDesde={medico.disponible_desde}
        disponibleHasta={medico.disponible_hasta}
        duracionConsulta={medico.duracion_consulta}
        precioConsulta={medico.precio_consulta}
        consultasPendientesCount={consultasPendientes.length}
        ocultoClinica={medico.oculto_clinica}
        visibleConsultorioParticular={medico.visible_consultorio_particular ?? true}
        perfilCompleto={perfilCompletoReal}
      />
    );

    return (
      <DashboardMedicoProvider
        medicoId={medico.id}
        initialPendientes={consultasPendientes}
        initialEnCurso={consultasEnCurso}
        initialTurnosEspera={turnosEsperaCompletos.map((t) => ({ ...t, entradoEn: Date.now() }))}
        initialDisponible={medico.disponible}
        initialTurnosActivosHoy={hayTurnosActivosHoy}
        postVideollamada={from === "videollamada"}
      >
        <div className="min-h-full bg-[#f8f9fa]">
          <PresenciaTracker rol="medico" />
          <ModalPushMedico />
          <PopupEsperando />
          <PopupPagada />
          {aviso === "sin-cuil" && (
            <div className="bg-[#BA7517]/10 px-4 py-3 text-center text-sm text-[#BA7517]" style={{ borderBottom: "1px solid #BA7517" }}>
              El paciente no complet&oacute; su CUIL &mdash; la receta no fue incluida en los documentos.
            </div>
          )}
          {/* Topbar */}
          <nav className="bg-white" style={{ borderBottom: "0.5px solid #e5e7eb" }}>
            <div className="mx-auto max-w-7xl px-4 lg:px-6">
              {/* Linea 1 */}
              <div className="flex h-14 items-center justify-between">
                <div className="flex items-center gap-4 lg:gap-5">
                  <span className="text-lg font-medium text-gray-900">Docto</span>
                  <BadgeEsperando />
                  <div className="flex items-center gap-1.5">
                    <span className={`inline-block h-2 w-2 rounded-full ${medico.disponible ? "bg-[#1D9E75] animate-pulse" : "bg-gray-300"}`} />
                    <span className="text-xs text-gray-500">{medico.disponible ? "Disponible" : "No disponible"}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3 lg:gap-4">
                  <BotonSilenciar />
                  {flagNovaAi && (
                    <Link href="/medico/nova" className="text-sm font-medium text-[#378ADD] hover:text-[#2e6fb5] transition-colors">
                      Nova
                    </Link>
                  )}
                  <span className="hidden text-sm text-gray-500 lg:inline">{fullName}</span>
                  <AvatarDropdown
                    initials={initials}
                    fullName={fullName}
                    email={user.email ?? ""}
                    perfilCompleto={perfilCompletoReal}
                  />
                </div>
              </div>
              {/* Linea 2 — solo mobile */}
              <div className="flex h-8 items-center lg:hidden">
                <p className="truncate text-sm text-gray-600">{fullName}</p>
              </div>
            </div>
          </nav>

          <div className="mx-auto max-w-7xl px-6 py-6">
            {/* Nova widget — solo si flag activo */}
            {flagNovaAi && (
              <NovaWidget
                nombreMedico={fullName}
                turnosHoy={turnosHoy.length}
              />
            )}

            {/* Activar notificaciones push */}
            <div className="mt-4">
              <BotonPush rol="medico" />
            </div>

            {/* Panel progreso perfil */}
            <div className="mt-4">
              <PanelProgresoPerfil
                perfilCompleto={perfilCompletoReal}
                telefono={medico.telefono}
                fotoUrl={medico.foto_url}
                domicilioConsultorio={medico.domicilio_consultorio}
                nombreCompleto={medico.nombre_completo}
                especialidad={medico.especialidad}
                numeroMatricula={medico.numero_matricula}
                tipoMatricula={medico.tipo_matricula}
              />
              <BannerMercadoPago mpConectado={mpConectado} />
              <BannerFirmaElectronica firmaConfigurada={firmaConfigurada} />
            </div>

            {/* Métricas full width */}
            <MetricasMedico
              medicoId={medico.id}
              inicial={{
                turnos: turnosHoy.filter((t) => t.estado === "confirmado" || t.estado === "en_espera").length,
                enEspera: turnosEsperaCompletos.length + consultasPendientes.length,
                completadas: completadasHoy,
                ingresos: ingresosHoy,
                neto: netoHoy,
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

            {/* Consultorio Particular — al fondo del scroll, acceso discreto */}
            {medico.slug && (
              <div className="mt-8">
                <CardConsultorio slug={medico.slug} />
              </div>
            )}
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
    <div className="min-h-full" style={{ backgroundColor: "var(--color-bg-secondary)" }}>
      <AppNavbar userName={fullName} userRole="paciente" />

      <main className="mx-auto max-w-lg px-6 py-8">
        {/* -- ESTADO 1: Turno en curso (programado) -- */}
        {turnoEnCursoPaciente && (
          <div className="mb-5 rounded-[var(--radius-lg)] bg-white p-5" style={{ border: "1.5px solid var(--color-info)" }}>
            <div className="flex items-center gap-2">
              <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full" style={{ backgroundColor: "var(--color-info)" }} />
              <span className="text-xs font-semibold tracking-wide" style={{ color: "var(--color-info)" }}>CONSULTA EN CURSO</span>
            </div>
            <p className="mt-3 text-[15px] font-medium" style={{ color: "var(--color-text-primary)" }}>
              Tu consulta con {formatNombreMedico(turnoEnCursoPaciente.medico_nombre)} esta en curso
            </p>
            <p className="mt-0.5 text-sm" style={{ color: "var(--color-text-secondary)" }}>Turno de las {turnoEnCursoPaciente.hora_inicio.slice(0, 5)} hs</p>
            <Link
              href={`/turno/${turnoEnCursoPaciente.id}/sala`}
              className="mt-4 block w-full rounded-[var(--radius-md)] py-2.5 text-center text-sm font-medium text-white active:scale-[0.97] transition-all duration-100"
              style={{ backgroundColor: "var(--color-info)" }}
            >
              Volver a la videollamada
            </Link>
          </div>
        )}

        {/* -- ESTADO 1: Consulta inmediata activa -- */}
        {consultaActiva && !turnoEnCursoPaciente && (
          <div
            className="mb-5 rounded-[var(--radius-lg)] bg-white p-5"
            style={{ border: `1.5px solid ${consultaActiva.estado === "en_curso" ? "var(--color-info)" : "var(--color-success)"}` }}
          >
            <div className="flex items-center gap-2">
              <span
                className="inline-block h-2.5 w-2.5 animate-pulse rounded-full"
                style={{ background: consultaActiva.estado === "en_curso" ? "var(--color-info)" : "var(--color-success)" }}
              />
              <span
                className="text-xs font-semibold tracking-wide"
                style={{ color: consultaActiva.estado === "en_curso" ? "var(--color-info)" : "var(--color-success)" }}
              >
                {consultaActiva.estado === "en_curso" ? "CONSULTA EN CURSO" : "EN SALA DE ESPERA"}
              </span>
            </div>
            <p className="mt-3 text-[15px] font-medium" style={{ color: "var(--color-text-primary)" }}>
              {consultaActiva.estado === "en_curso"
                ? `Tu consulta con ${formatNombreMedico(consultaActiva.medico_nombre)} esta en curso`
                : "Tu medico te atendera en breve"}
            </p>
            <p className="mt-0.5 text-sm" style={{ color: "var(--color-text-secondary)" }}>{consultaActiva.especialidad} - {formatNombreMedico(consultaActiva.medico_nombre)}</p>
            <Link
              href={consultaActiva.estado === "en_curso" ? `/consulta/${consultaActiva.id}/sala` : `/sala-espera/${consultaActiva.id}`}
              className="mt-4 block w-full rounded-[var(--radius-md)] py-2.5 text-center text-sm font-medium text-white active:scale-[0.97] transition-all duration-100"
              style={{ background: consultaActiva.estado === "en_curso" ? "var(--color-info)" : "var(--color-success)" }}
            >
              {consultaActiva.estado === "en_curso" ? "Volver a la videollamada" : "Ir a la sala de espera"}
            </Link>
          </div>
        )}

        {/* -- ESTADO 1b: Turno en espera (esperando al medico) -- */}
        {!turnoEnCursoPaciente && !consultaActiva && (() => {
          const enEspera = turnosPaciente.find((t) => t.estado === "en_espera");
          if (!enEspera) return null;
          return (
            <div className="mb-5 rounded-[var(--radius-lg)] bg-white p-5" style={{ border: "1.5px solid var(--color-success)" }}>
              <div className="flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full" style={{ backgroundColor: "var(--color-success)" }} />
                <span className="text-xs font-semibold tracking-wide" style={{ color: "var(--color-success)" }}>EN SALA DE ESPERA</span>
              </div>
              <p className="mt-3 text-[15px] font-medium" style={{ color: "var(--color-text-primary)" }}>Tu medico te atendera en breve</p>
              <p className="mt-0.5 text-sm" style={{ color: "var(--color-text-secondary)" }}>{formatNombreMedico(enEspera.medico_nombre)} - {enEspera.hora_inicio.slice(0, 5)} hs</p>
              <Link
                href={`/turno/${enEspera.id}/info-medica?redirect=/turno/${enEspera.id}/espera`}
                className="mt-4 block w-full rounded-[var(--radius-md)] py-2.5 text-center text-sm font-medium text-white active:scale-[0.97] transition-all duration-100"
                style={{ backgroundColor: "var(--color-success)" }}
              >
                Ir a sala de espera
              </Link>
            </div>
          );
        })()}

        {/* -- ESTADO 2: Proximo turno hoy -- */}
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
            <div className="mb-5 rounded-[var(--radius-lg)] bg-white p-5" style={{ border: "1px solid var(--color-border-default)" }}>
              <p className="text-xs font-semibold tracking-wide" style={{ color: "var(--color-text-tertiary)" }}>TU PROXIMO TURNO</p>
              <p className="mt-2 text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>
                Hoy a las {proximoHoy.hora_inicio.slice(0, 5)} hs con {formatNombreMedico(proximoHoy.medico_nombre)}
              </p>
              <p className="mt-0.5 text-xs" style={{ color: "var(--color-text-secondary)" }}>{proximoHoy.especialidad}</p>
              {mostrarSala && (
                <Link
                  href={`/turno/${proximoHoy.id}/info-medica?redirect=/turno/${proximoHoy.id}/espera`}
                  className="mt-3 block w-full rounded-[var(--radius-md)] py-2.5 text-center text-sm font-medium text-white active:scale-[0.97] transition-all duration-100"
                  style={{ backgroundColor: "var(--color-success)" }}
                >
                  Ir a sala de espera
                </Link>
              )}
            </div>
          );
        })()}

        {/* -- Accion principal: Clinica Virtual -- */}
        <Link
          href="/clinica"
          className="block rounded-[var(--radius-lg)] bg-white p-6 transition hover:shadow-[var(--shadow-xs)]"
          style={{ border: "1px solid var(--color-border-default)" }}
        >
          <Building2 size={32} strokeWidth={1.75} style={{ color: "var(--color-brand)" }} />
          <p className="mt-3 text-base font-medium" style={{ color: "var(--color-text-primary)" }}>Clinica Virtual</p>
          <p className="mt-1 text-sm" style={{ color: "var(--color-text-secondary)" }}>Consulta un medico ahora o agenda turno</p>
        </Link>

        {/* -- Mis turnos -- */}
        <div className="mt-5">
          <MisTurnosPaciente turnos={turnosPaciente} />
        </div>
      </main>
    </div>
  );
}
