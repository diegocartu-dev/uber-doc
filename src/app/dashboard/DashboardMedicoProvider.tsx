"use client";

import { createContext, useContext, useEffect, useRef, useState, useCallback, type ReactNode } from "react";
import { soundPacienteEsperando } from "@/lib/sounds";

const POLL_INTERVAL = 5000;

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

type DashboardCtx = {
  pendientes: ConsultaPendiente[];
  enCurso: ConsultaEnCurso[];
  turnosEspera: TurnoEspera[];
  disponible: boolean;
  turnosActivosHoy: boolean;
  setDisponible: (v: boolean) => void;
};

const Ctx = createContext<DashboardCtx>({
  pendientes: [],
  enCurso: [],
  turnosEspera: [],
  disponible: false,
  turnosActivosHoy: false,
  setDisponible: () => {},
});

export function useDashboardMedico() {
  return useContext(Ctx);
}

export default function DashboardMedicoProvider({
  medicoId,
  initialPendientes,
  initialEnCurso,
  initialTurnosEspera,
  initialDisponible,
  initialTurnosActivosHoy,
  children,
}: {
  medicoId: string;
  initialPendientes: ConsultaPendiente[];
  initialEnCurso: ConsultaEnCurso[];
  initialTurnosEspera: TurnoEspera[];
  initialDisponible: boolean;
  initialTurnosActivosHoy: boolean;
  children: ReactNode;
}) {
  const [pendientes, setPendientes] = useState(initialPendientes);
  const [enCurso, setEnCurso] = useState(initialEnCurso);
  const [turnosEspera, setTurnosEspera] = useState(initialTurnosEspera);
  const [disponible, setDisponible] = useState(initialDisponible);
  const [turnosActivosHoy, setTurnosActivosHoy] = useState(initialTurnosActivosHoy);

  const prevPendientesCount = useRef(initialPendientes.length);
  const prevTurnosCount = useRef(initialTurnosEspera.length);

  const handleSetDisponible = useCallback((v: boolean) => {
    setDisponible(v);
  }, []);

  useEffect(() => {
    async function poll() {
      try {
        const res = await fetch("/api/medico/dashboard-estado", {
          credentials: "include",
        });
        if (!res.ok) return;
        const data = await res.json();

        setPendientes(data.consultas_pendientes);
        setEnCurso(data.consultas_en_curso);
        setDisponible(data.disponible);
        setTurnosActivosHoy((data.turnos_activos_hoy ?? 0) > 0);

        // Preserve entradoEn for known turnos
        setTurnosEspera((prev) =>
          data.turnos_espera.map((t: TurnoEspera) => {
            const existente = prev.find((p) => p.id === t.id);
            return { ...t, entradoEn: existente?.entradoEn ?? Date.now() };
          })
        );

        // Sound notification if MORE pending consultas or turnos
        if (
          data.consultas_pendientes.length > prevPendientesCount.current ||
          data.turnos_espera.length > prevTurnosCount.current
        ) {
          soundPacienteEsperando();
        }
        prevPendientesCount.current = data.consultas_pendientes.length;
        prevTurnosCount.current = data.turnos_espera.length;
      } catch {
        // silently ignore network errors
      }
    }

    poll();
    const interval = setInterval(poll, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [medicoId]);

  // Badge in title
  useEffect(() => {
    const total = pendientes.length + turnosEspera.length;
    document.title = total > 0 ? `(${total}) Docto — Medico` : "Docto — Medico";
  }, [pendientes.length, turnosEspera.length]);

  return (
    <Ctx.Provider value={{ pendientes, enCurso, turnosEspera, disponible, turnosActivosHoy, setDisponible: handleSetDisponible }}>
      {children}
    </Ctx.Provider>
  );
}
