"use client";

import { createContext, useContext, useEffect, useRef, useState, useCallback, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import { soundPacienteEsperando, soundVideoLista, unlockAudio } from "@/lib/sounds";

const POLL_INTERVAL = 5000;
const SILENCIADO_KEY = "docto_notif_silenciado";

type ConsultaPendiente = {
  id: string;
  especialidad: string;
  estado: string;
  created_at: string;
  paciente_nombre: string;
  paciente_tabla_id: string | null;
  motivo_consulta: string | null;
  fecha_nacimiento: string | null;
  canal_origen?: string;
};

type ConsultaEnCurso = {
  id: string;
  especialidad: string;
  estado: string;
  paciente_nombre: string;
  paciente_tabla_id: string | null;
  sala_video_url: string | null;
  motivo_consulta: string | null;
  sintomas: string[] | null;
  created_at: string;
  fecha_nacimiento: string | null;
  canal_origen?: string;
};

type TurnoEspera = {
  id: string;
  fecha: string;
  hora_inicio: string;
  paciente_nombre: string;
  paciente_tabla_id: string | null;
  especialidad: string;
  entradoEn: number;
  canal_origen?: string;
};

type PopupData = {
  pacienteNombre: string;
  esperandoDesde: string;
  consultaId: string;
  tipo: "consulta" | "turno";
} | null;

type PopupPagada = {
  consultaId: string;
  pacienteNombre: string;
} | null;

type DashboardCtx = {
  pendientes: ConsultaPendiente[];
  enCurso: ConsultaEnCurso[];
  turnosEspera: TurnoEspera[];
  disponible: boolean;
  turnosActivosHoy: boolean;
  setDisponible: (v: boolean) => void;
  bloquearPollDisponible: React.MutableRefObject<boolean>;
  enVideollamada: boolean;
  silenciado: boolean;
  setSilenciado: (v: boolean) => void;
  popupData: PopupData;
  dismissPopup: () => void;
  popupPagada: PopupPagada;
  dismissPopupPagada: () => void;
  totalEsperando: number;
  badgeFlash: boolean;
};

const defaultBloquear = { current: false };
const Ctx = createContext<DashboardCtx>({
  pendientes: [],
  enCurso: [],
  turnosEspera: [],
  disponible: false,
  turnosActivosHoy: false,
  setDisponible: () => {},
  bloquearPollDisponible: defaultBloquear,
  enVideollamada: false,
  silenciado: false,
  setSilenciado: () => {},
  popupData: null,
  dismissPopup: () => {},
  popupPagada: null,
  dismissPopupPagada: () => {},
  totalEsperando: 0,
  badgeFlash: false,
});

export function useDashboardMedico() {
  return useContext(Ctx);
}

function getFirstWaiting(
  pendientes: ConsultaPendiente[],
  turnosEspera: TurnoEspera[]
): PopupData {
  if (pendientes.length > 0) {
    const p = pendientes[0];
    return {
      pacienteNombre: p.paciente_nombre,
      esperandoDesde: p.created_at,
      consultaId: p.id,
      tipo: "consulta",
    };
  }
  if (turnosEspera.length > 0) {
    const t = turnosEspera[0];
    return {
      pacienteNombre: t.paciente_nombre,
      esperandoDesde: new Date(t.entradoEn).toISOString(),
      consultaId: t.id,
      tipo: "turno",
    };
  }
  return null;
}

export default function DashboardMedicoProvider({
  medicoId,
  initialPendientes,
  initialEnCurso,
  initialTurnosEspera,
  initialDisponible,
  initialTurnosActivosHoy,
  postVideollamada = false,
  children,
}: {
  medicoId: string;
  initialPendientes: ConsultaPendiente[];
  initialEnCurso: ConsultaEnCurso[];
  initialTurnosEspera: TurnoEspera[];
  initialDisponible: boolean;
  initialTurnosActivosHoy: boolean;
  postVideollamada?: boolean;
  children: ReactNode;
}) {
  const [pendientes, setPendientes] = useState(initialPendientes);
  const [enCurso, setEnCurso] = useState(initialEnCurso);
  const [turnosEspera, setTurnosEspera] = useState(initialTurnosEspera);
  const [disponible, setDisponible] = useState(initialDisponible);
  const [turnosActivosHoy, setTurnosActivosHoy] = useState(initialTurnosActivosHoy);
  const bloquearPollDisponible = useRef(false);
  const [popupData, setPopupData] = useState<PopupData>(null);
  const [popupPagada, setPopupPagada] = useState<PopupPagada>(null);
  const [silenciado, setSilenciadoState] = useState(false);
  const silenciadoRef = useRef(false);
  const [badgeFlash, setBadgeFlash] = useState(false);

  const prevPendientesCount = useRef(initialPendientes.length);
  const prevTurnosCount = useRef(initialTurnosEspera.length);
  const prevEnVideollamada = useRef(initialEnCurso.some((c) => c.estado === "en_curso"));
  // IDs de consultas ya en estado "pagada". Inicializa con las que vienen del SSR
  // para no disparar un popup falso al recargar con una consulta ya pagada.
  const prevPagadasIds = useRef<Set<string>>(
    new Set(initialEnCurso.filter((c) => c.estado === "pagada").map((c) => c.id))
  );

  const enVideollamada = enCurso.some((c) => c.estado === "en_curso");
  const totalEsperando = pendientes.length + turnosEspera.length;

  useEffect(() => {
    try {
      const stored = localStorage.getItem(SILENCIADO_KEY) === "true";
      setSilenciadoState(stored);
      silenciadoRef.current = stored;
    } catch {}
  }, []);

  const setSilenciado = useCallback((v: boolean) => {
    setSilenciadoState(v);
    silenciadoRef.current = v;
    try { localStorage.setItem(SILENCIADO_KEY, String(v)); } catch {}
  }, []);

  const handleSetDisponible = useCallback((v: boolean) => {
    setDisponible(v);
  }, []);

  const dismissPopup = useCallback(() => {
    setPopupData(null);
    setBadgeFlash(true);
    setTimeout(() => setBadgeFlash(false), 600);
  }, []);

  const dismissPopupPagada = useCallback(() => {
    setPopupPagada(null);
  }, []);

  // Respaldo de desbloqueo de audio: si el médico recarga con "Disponible" ya
  // activo, no pasa por el toggle. El primer pointerdown desbloquea el audio.
  useEffect(() => {
    const handler = () => unlockAudio();
    window.addEventListener("pointerdown", handler, { once: true, capture: true });
    return () => window.removeEventListener("pointerdown", handler, { capture: true });
  }, []);

  // Post-videollamada: trigger inmediato al montar si viene de finalizar consulta
  useEffect(() => {
    if (postVideollamada && totalEsperando > 0) {
      setPopupData(getFirstWaiting(pendientes, turnosEspera));
      soundPacienteEsperando();
    }
    // Solo al montar
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const poll = useCallback(async () => {
    try {
      const res = await fetch("/api/medico/dashboard-estado", {
        credentials: "include",
      });
      if (res.status === 401) {
        console.error("[AUTH] 401 en polling médico", {
          endpoint: "/api/medico/dashboard-estado",
          timestamp: new Date().toISOString(),
        });
        return;
      }
      if (!res.ok) return;
      const data = await res.json();

      setPendientes(data.consultas_pendientes);
      setEnCurso(data.consultas_en_curso);
      if (!bloquearPollDisponible.current) {
        setDisponible(data.disponible);
      }
      setTurnosActivosHoy((data.turnos_activos_hoy ?? 0) > 0);

      // Preserve entradoEn for known turnos
      setTurnosEspera((prev) =>
        data.turnos_espera.map((t: TurnoEspera) => {
          const existente = prev.find((p) => p.id === t.id);
          return { ...t, entradoEn: existente?.entradoEn ?? Date.now() };
        })
      );

      const enCursoData: ConsultaEnCurso[] = data.consultas_en_curso ?? [];
      const hayVideoActiva = enCursoData.some((c) => c.estado === "en_curso");

      // ── Detección aceptada→pagada (diff por Set de IDs, no por contador:
      // necesitamos saber CUÁL pagó). ──
      const pagadasAhora = enCursoData.filter((c) => c.estado === "pagada");
      const pagadaNueva = pagadasAhora.find((c) => !prevPagadasIds.current.has(c.id));
      // Actualizar el set con el estado actual (entran nuevas, salen las que
      // pasaron a en_curso/completada).
      prevPagadasIds.current = new Set(pagadasAhora.map((c) => c.id));

      // Transición: videollamada terminó. Prioridad: si quedó una pagada sin
      // mostrar, abrir el modal de pagada por sobre el toast de esperando.
      if (prevEnVideollamada.current && !hayVideoActiva) {
        if (pagadasAhora.length > 0) {
          const p = pagadasAhora[0];
          setPopupPagada({ consultaId: p.id, pacienteNombre: p.paciente_nombre });
          if (!silenciadoRef.current) soundVideoLista();
        } else {
          const pends = data.consultas_pendientes ?? [];
          const turnos = data.turnos_espera ?? [];
          if (pends.length > 0 || turnos.length > 0) {
            setPopupData(getFirstWaiting(pends, turnos));
            soundPacienteEsperando();
          }
        }
      }
      prevEnVideollamada.current = hayVideoActiva;

      // Pagada nueva detectada fuera de videollamada → modal + sonido.
      if (!hayVideoActiva && pagadaNueva) {
        setPopupPagada({ consultaId: pagadaNueva.id, pacienteNombre: pagadaNueva.paciente_nombre });
        if (!silenciadoRef.current) soundVideoLista();
      }

      // Sound + popup si hay NUEVOS pacientes esperando y NO está en videollamada
      if (!hayVideoActiva) {
        if (
          data.consultas_pendientes.length > prevPendientesCount.current ||
          data.turnos_espera.length > prevTurnosCount.current
        ) {
          if (!silenciadoRef.current) soundPacienteEsperando();
          setPopupData(getFirstWaiting(data.consultas_pendientes, data.turnos_espera));
        }
      }

      prevPendientesCount.current = data.consultas_pendientes.length;
      prevTurnosCount.current = data.turnos_espera.length;
    } catch {
      // silently ignore network errors
    }
  }, []);

  // Polling de fallback
  useEffect(() => {
    poll();
    const interval = setInterval(poll, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [poll]);

  // Realtime: dispara poll() inmediatamente al detectar cambios en consultas o turnos del médico.
  // Sin filtro en el canal porque medico_id no es PK (falla en Supabase Realtime).
  // Filtramos en JS antes de llamar poll().
  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`dashboard-realtime-${medicoId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "consultas" },
        (payload) => {
          const row = payload.new as { medico_id?: string } | null;
          if (payload.eventType === "DELETE" || row?.medico_id === medicoId) {
            poll();
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "turnos" },
        (payload) => {
          const row = payload.new as { medico_id?: string } | null;
          if (payload.eventType === "DELETE" || row?.medico_id === medicoId) {
            poll();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [medicoId, poll]);

  // Title con emoji cuando hay pacientes esperando (solo fuera de videollamada)
  useEffect(() => {
    if (enVideollamada) {
      document.title = totalEsperando > 0
        ? `(${totalEsperando}) Docto — Medico`
        : "Docto — Medico";
    } else {
      document.title = totalEsperando > 0
        ? `\u{1F534} (${totalEsperando}) Paciente esperando — Docto`
        : "Docto — Medico";
    }
  }, [totalEsperando, enVideollamada]);

  useEffect(() => {
    if (totalEsperando === 0) {
      setPopupData(null);
    }
  }, [totalEsperando]);

  // Cierra el modal de pagada si la consulta dejó de estar en estado "pagada"
  // (el médico la inició → en_curso, o se canceló). Evita modal colgado.
  useEffect(() => {
    if (popupPagada && !enCurso.some((c) => c.id === popupPagada.consultaId && c.estado === "pagada")) {
      setPopupPagada(null);
    }
  }, [enCurso, popupPagada]);

  return (
    <Ctx.Provider value={{
      pendientes, enCurso, turnosEspera, disponible, turnosActivosHoy,
      setDisponible: handleSetDisponible, bloquearPollDisponible,
      enVideollamada, silenciado, setSilenciado,
      // Prioridad: el modal de pagada suprime el toast de esperando.
      // Ambos se anulan durante una videollamada activa.
      popupData: enVideollamada || popupPagada ? null : popupData,
      dismissPopup,
      popupPagada: enVideollamada ? null : popupPagada,
      dismissPopupPagada, totalEsperando, badgeFlash,
    }}>
      {children}
    </Ctx.Provider>
  );
}
