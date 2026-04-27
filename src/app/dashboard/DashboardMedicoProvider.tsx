"use client";

import { createContext, useContext, useEffect, useRef, useState, useCallback, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import { soundPacienteEsperando } from "@/lib/sounds";

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
  const [silenciado, setSilenciadoState] = useState(false);
  const silenciadoRef = useRef(false);
  const [badgeFlash, setBadgeFlash] = useState(false);

  const prevPendientesCount = useRef(initialPendientes.length);
  const prevTurnosCount = useRef(initialTurnosEspera.length);
  const prevEnVideollamada = useRef(initialEnCurso.some((c) => c.estado === "en_curso"));

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

      const hayVideoActiva = (data.consultas_en_curso ?? []).some(
        (c: ConsultaEnCurso) => c.estado === "en_curso"
      );

      // Transición: videollamada terminó → notificar si hay pacientes esperando
      if (prevEnVideollamada.current && !hayVideoActiva) {
        const pends = data.consultas_pendientes ?? [];
        const turnos = data.turnos_espera ?? [];
        if (pends.length > 0 || turnos.length > 0) {
          setPopupData(getFirstWaiting(pends, turnos));
          soundPacienteEsperando();
        }
      }
      prevEnVideollamada.current = hayVideoActiva;

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

  return (
    <Ctx.Provider value={{
      pendientes, enCurso, turnosEspera, disponible, turnosActivosHoy,
      setDisponible: handleSetDisponible, bloquearPollDisponible,
      enVideollamada, silenciado, setSilenciado,
      popupData: enVideollamada ? null : popupData,
      dismissPopup, totalEsperando, badgeFlash,
    }}>
      {children}
    </Ctx.Provider>
  );
}
