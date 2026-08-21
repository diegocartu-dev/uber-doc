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

// "Paciente listo" de cualquier canal: CI que pasó a pagada o turno que entró
// a la sala de espera. Ambos disparan el mismo modal prominente.
type PopupListo = {
  tipo: "consulta" | "turno";
  id: string;
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
  popupListo: PopupListo;
  dismissPopupListo: () => void;
  flashConsultaId: string | null;
  totalEsperando: number;
  badgeFlash: boolean;
  /** El sistema apagó la disponibilidad (auto-apagado por tiempo) con la
   *  pantalla abierta: popup + sonido, mismo trato que un paciente nuevo. */
  avisoApagado: boolean;
  dismissAvisoApagado: () => void;
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
  popupListo: null,
  dismissPopupListo: () => {},
  flashConsultaId: null,
  totalEsperando: 0,
  badgeFlash: false,
  avisoApagado: false,
  dismissAvisoApagado: () => {},
});

export function useDashboardMedico() {
  return useContext(Ctx);
}

// El toast suave (momento 1) es SOLO para CI nueva por aceptar. Los turnos en
// sala de espera ya NO van al toast: disparan el modal prominente "paciente listo".
function getFirstWaiting(pendientes: ConsultaPendiente[]): PopupData {
  if (pendientes.length > 0) {
    const p = pendientes[0];
    return {
      pacienteNombre: p.paciente_nombre,
      esperandoDesde: p.created_at,
      consultaId: p.id,
      tipo: "consulta",
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
  const [avisoApagado, setAvisoApagado] = useState(false);
  // Último valor de `disponible` que esta pantalla ya conoce. Se actualiza en
  // el toggle manual Y en cada poll: así, cuando el poll trae `false` y acá
  // todavía decía `true`, el cambio vino DE AFUERA (el auto-apagado del cron) y
  // hay que avisarlo con sonido. El toggle manual no dispara nada porque
  // actualiza esta ref antes del próximo poll.
  const disponibleConocidoRef = useRef(initialDisponible);
  const [turnosActivosHoy, setTurnosActivosHoy] = useState(initialTurnosActivosHoy);
  const bloquearPollDisponible = useRef(false);
  const [popupData, setPopupData] = useState<PopupData>(null);
  const [popupListo, setPopupListo] = useState<PopupListo>(null);
  const [flashConsultaId, setFlashConsultaId] = useState<string | null>(null);
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
  // IDs de turnos ya en sala de espera. Inicializa con los del SSR para no
  // disparar un modal falso al recargar con un turno ya esperando.
  const prevTurnosEsperaIds = useRef<Set<string>>(
    new Set(initialTurnosEspera.map((t) => t.id))
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
    disponibleConocidoRef.current = v;
    setDisponible(v);
    // Si se reactiva, el aviso de apagado ya no aplica.
    if (v) setAvisoApagado(false);
  }, []);

  const dismissAvisoApagado = useCallback(() => setAvisoApagado(false), []);

  const dismissPopup = useCallback(() => {
    setPopupData(null);
    setBadgeFlash(true);
    setTimeout(() => setBadgeFlash(false), 600);
  }, []);

  const dismissPopupListo = useCallback(() => {
    setPopupListo((prev) => {
      // Al descartar "Ahora no" en una CI pagada, flashea la card del paciente en
      // ConsultasEnCurso. Para turnos no hay card equivalente, así que no flashea.
      if (prev && prev.tipo === "consulta") {
        setFlashConsultaId(prev.id);
        setTimeout(() => setFlashConsultaId(null), 600);
      }
      return null;
    });
  }, []);

  // Respaldo de desbloqueo de audio: si el médico recarga con "Disponible" ya
  // activo, no pasa por el toggle. El primer pointerdown desbloquea el audio.
  useEffect(() => {
    const handler = () => unlockAudio();
    window.addEventListener("pointerdown", handler, { once: true, capture: true });
    return () => window.removeEventListener("pointerdown", handler, { capture: true });
  }, []);

  // Post-videollamada: trigger inmediato al montar si viene de finalizar consulta.
  // Prioridad "paciente listo" (modal) sobre "CI esperando" (toast):
  //   - Turno ya en sala de espera o CI ya pagada → modal prominente.
  //   - Si no, CI pendiente por aceptar → toast suave.
  useEffect(() => {
    if (!postVideollamada) return;
    const turnoListo = turnosEspera[0];
    const ciPagada = enCurso.find((c) => c.estado === "pagada");
    if (turnoListo) {
      setPopupListo({ tipo: "turno", id: turnoListo.id, pacienteNombre: turnoListo.paciente_nombre });
      if (!silenciadoRef.current) soundVideoLista();
    } else if (ciPagada) {
      setPopupListo({ tipo: "consulta", id: ciPagada.id, pacienteNombre: ciPagada.paciente_nombre });
      if (!silenciadoRef.current) soundVideoLista();
    } else if (pendientes.length > 0) {
      setPopupData(getFirstWaiting(pendientes));
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
        // Apagado EXTERNO (el cron de auto-apagado, decisión Diego 20/08/2026):
        // el server dice false y esta pantalla todavía creía true. Sin esto, el
        // médico que está en la compu con la pestaña de fondo sigue creyendo
        // que está publicado — el aviso persistente (mensaje interno + push) ya
        // existe, pero no suena en la pantalla abierta, que es donde está él.
        if (disponibleConocidoRef.current && !data.disponible) {
          setAvisoApagado(true);
          if (!silenciadoRef.current) soundPacienteEsperando();
        }
        disponibleConocidoRef.current = data.disponible;
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
      const turnosEsperaData: TurnoEspera[] = data.turnos_espera ?? [];
      const pendientesData: ConsultaPendiente[] = data.consultas_pendientes ?? [];
      const hayVideoActiva = enCursoData.some((c) => c.estado === "en_curso");

      // ── Detección aceptada→pagada (diff por Set de IDs, no por contador:
      // necesitamos saber CUÁL pagó). ──
      const pagadasAhora = enCursoData.filter((c) => c.estado === "pagada");
      const pagadaNueva = pagadasAhora.find((c) => !prevPagadasIds.current.has(c.id));
      // Actualizar el set con el estado actual (entran nuevas, salen las que
      // pasaron a en_curso/completada).
      prevPagadasIds.current = new Set(pagadasAhora.map((c) => c.id));

      // ── Detección turno→sala de espera (mismo patrón de diff por Set). Un turno
      // que aparece nuevo en turnos_espera es un "paciente listo" → modal. ──
      const turnoNuevo = turnosEsperaData.find((t) => !prevTurnosEsperaIds.current.has(t.id));
      prevTurnosEsperaIds.current = new Set(turnosEsperaData.map((t) => t.id));

      // "Paciente listo" del poll: prioridad CI pagada nueva sobre turno nuevo
      // (un solo modal a la vez). Ambos Sets ya quedaron actualizados arriba, así
      // que el que no se muestre ahora no se re-disparará en el próximo poll.
      const listoNuevo: PopupListo = pagadaNueva
        ? { tipo: "consulta", id: pagadaNueva.id, pacienteNombre: pagadaNueva.paciente_nombre }
        : turnoNuevo
        ? { tipo: "turno", id: turnoNuevo.id, pacienteNombre: turnoNuevo.paciente_nombre }
        : null;

      // Transición: videollamada terminó. Prioridad: si hay un paciente listo
      // (CI pagada o turno en espera, aunque ya estuviera esperando), abrir el
      // modal por sobre el toast.
      const esTickTransicion = prevEnVideollamada.current && !hayVideoActiva;
      if (esTickTransicion) {
        const pagadaPendiente = pagadasAhora[0];
        const turnoPendiente = turnosEsperaData[0];
        if (pagadaPendiente) {
          setPopupListo({ tipo: "consulta", id: pagadaPendiente.id, pacienteNombre: pagadaPendiente.paciente_nombre });
          if (!silenciadoRef.current) soundVideoLista();
        } else if (turnoPendiente) {
          setPopupListo({ tipo: "turno", id: turnoPendiente.id, pacienteNombre: turnoPendiente.paciente_nombre });
          if (!silenciadoRef.current) soundVideoLista();
        } else if (pendientesData.length > 0) {
          setPopupData(getFirstWaiting(pendientesData));
          soundPacienteEsperando();
        }
      }
      prevEnVideollamada.current = hayVideoActiva;

      // Paciente listo nuevo detectado fuera de videollamada → modal + sonido.
      // En el tick de transición ya se priorizó arriba; no duplicar.
      if (!hayVideoActiva && !esTickTransicion && listoNuevo) {
        setPopupListo(listoNuevo);
        if (!silenciadoRef.current) soundVideoLista();
      }

      // Toast suave SOLO para CI nueva por aceptar (turnos van al modal de arriba).
      if (!hayVideoActiva && !esTickTransicion && pendientesData.length > prevPendientesCount.current) {
        if (!silenciadoRef.current) soundPacienteEsperando();
        setPopupData(getFirstWaiting(pendientesData));
      }

      prevPendientesCount.current = pendientesData.length;
      prevTurnosCount.current = turnosEsperaData.length;
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

  // Cierra el modal "paciente listo" si el paciente dejó de estar listo. Evita
  // modal colgado:
  //   - CI: la consulta dejó de estar "pagada" (el médico la inició → en_curso, o
  //     se canceló).
  //   - Turno: el turno dejó de estar en la sala de espera (atendido o se fue).
  useEffect(() => {
    if (!popupListo) return;
    const sigueListo =
      popupListo.tipo === "consulta"
        ? enCurso.some((c) => c.id === popupListo.id && c.estado === "pagada")
        : turnosEspera.some((t) => t.id === popupListo.id);
    if (!sigueListo) {
      setPopupListo(null);
    }
  }, [enCurso, turnosEspera, popupListo]);

  return (
    <Ctx.Provider value={{
      pendientes, enCurso, turnosEspera, disponible, turnosActivosHoy,
      setDisponible: handleSetDisponible, bloquearPollDisponible,
      avisoApagado, dismissAvisoApagado,
      enVideollamada, silenciado, setSilenciado,
      // Prioridad: el modal "paciente listo" suprime el toast de esperando.
      // Ambos se anulan durante una videollamada activa.
      popupData: enVideollamada || popupListo ? null : popupData,
      dismissPopup,
      popupListo: enVideollamada ? null : popupListo,
      dismissPopupListo, flashConsultaId, totalEsperando, badgeFlash,
    }}>
      {children}
    </Ctx.Provider>
  );
}
