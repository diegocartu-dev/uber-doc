"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { aceptarConsulta } from "@/app/sala-espera/[consultaId]/actions";
import { TouchButton } from "@/components/TouchButton";
import { soundPacienteEsperando } from "@/lib/sounds";

const POLL_INTERVAL = 3000;

type Consulta = {
  id: string;
  especialidad: string;
  estado: string;
  created_at: string;
  paciente_nombre: string;
  paciente_tabla_id: string | null;
  motivo_consulta: string | null;
  fecha_nacimiento: string | null;
};

function calcularEdad(fechaNac: string | null): string {
  if (!fechaNac) return "";
  const hoy = new Date();
  const nac = new Date(fechaNac);
  let edad = hoy.getFullYear() - nac.getFullYear();
  const m = hoy.getMonth() - nac.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < nac.getDate())) edad--;
  return `${edad} años`;
}

function tiempoEspera(fecha: string): string {
  if (!fecha) return "";
  const d = new Date(fecha);
  if (isNaN(d.getTime())) return "";
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "ahora";
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${min % 60} min`;
}

function getInitials(name: string): string {
  return name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

async function fetchNombrePaciente(
  supabase: ReturnType<typeof createClient>,
  pacienteUserId: string,
  retries = 3
): Promise<{ id: string | null; nombre: string; nacimiento: string | null }> {
  for (let i = 0; i < retries; i++) {
    const { data } = await supabase
      .from("pacientes")
      .select("id, nombre_completo, fecha_nacimiento")
      .eq("user_id", pacienteUserId)
      .single();
    if (data) return { id: data.id, nombre: data.nombre_completo, nacimiento: data.fecha_nacimiento };
    if (i < retries - 1) await new Promise((r) => setTimeout(r, 1000));
  }
  return { id: null, nombre: "Paciente", nacimiento: null };
}

export default function ConsultasPendientes({
  consultas: consultasIniciales,
  medicoId,
}: {
  consultas: Consulta[];
  medicoId: string;
}) {
  const [consultas, setConsultas] = useState(consultasIniciales);
  const [isPending, startTransition] = useTransition();
  const prevCountRef = useRef(consultasIniciales.length);

  useEffect(() => {
    setConsultas(consultasIniciales);
  }, [consultasIniciales]);

  // Polling cada 3s — reemplaza Realtime que no funciona en este setup
  useEffect(() => {
    const supabase = createClient();

    async function fetchPendientes() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: esperando } = await supabase
        .from("consultas")
        .select("id, especialidad, estado, created_at, paciente_id, motivo_consulta")
        .eq("medico_id", medicoId)
        .eq("estado", "esperando")
        .order("created_at", { ascending: true });

      if (!esperando) return;

      const pacUserIds = [...new Set(esperando.map((c) => c.paciente_id))];
      let pacMap = new Map<string, { id: string; nombre: string; nacimiento: string | null }>();
      if (pacUserIds.length > 0) {
        const { data: pacs } = await supabase
          .from("pacientes").select("id, user_id, nombre_completo, fecha_nacimiento").in("user_id", pacUserIds);
        pacMap = new Map((pacs ?? []).map((p) => [p.user_id, { id: p.id, nombre: p.nombre_completo, nacimiento: p.fecha_nacimiento }]));
      }

      setConsultas(esperando.map((c) => {
        const p = pacMap.get(c.paciente_id);
        return {
          id: c.id, especialidad: c.especialidad, estado: c.estado, created_at: c.created_at,
          paciente_nombre: p?.nombre ?? "Paciente", paciente_tabla_id: p?.id ?? null,
          motivo_consulta: c.motivo_consulta, fecha_nacimiento: p?.nacimiento ?? null,
        };
      }));

      if (esperando.length > prevCountRef.current) {
        soundPacienteEsperando();
      }
      prevCountRef.current = esperando.length;
    }

    fetchPendientes();
    const interval = setInterval(fetchPendientes, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [medicoId]);

  function handleAceptar(consultaId: string) {
    startTransition(async () => {
      await aceptarConsulta(consultaId);
      setConsultas((prev) => prev.filter((c) => c.id !== consultaId));
    });
  }

  if (consultas.length === 0) return (
    <div className="text-sm text-gray-400 py-4 text-center">
      Sin pacientes en espera
    </div>
  );

  return (
    <div className="rounded-xl bg-white p-6" style={{ border: "0.5px solid #e5e7eb" }}>
      <p className="text-xs font-medium tracking-wide text-gray-400">PACIENTES EN ESPERA</p>

      <div className="mt-4 space-y-3">
        {consultas.map((c) => {
          const edad = calcularEdad(c.fecha_nacimiento);
          const espera = tiempoEspera(c.created_at);
          const initials = getInitials(c.paciente_nombre);

          return (
            <div key={c.id} className="flex items-center gap-4 rounded-lg p-3 transition hover:bg-gray-50">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-medium text-gray-500">
                {initials}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  {c.paciente_tabla_id ? (
                    <a href={`/medico/paciente/${c.paciente_tabla_id}`} className="text-sm font-medium text-gray-900 hover:text-[#1D9E75]">{c.paciente_nombre}</a>
                  ) : (
                    <p className="text-sm font-medium text-gray-900">{c.paciente_nombre}</p>
                  )}
                  {edad && <span className="text-xs text-gray-400">{edad}</span>}
                </div>
                <p className="mt-0.5 truncate text-xs text-gray-500">
                  {[c.motivo_consulta, c.especialidad].filter(Boolean).join(" · ")}
                </p>
              </div>
              {espera && <span className="shrink-0 text-xs text-gray-400">{espera}</span>}
              <TouchButton
                disabled={isPending}
                onClick={() => handleAceptar(c.id)}
                className="shrink-0 rounded-lg bg-gray-100 px-3.5 py-2 text-xs font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50"
              >
                {isPending ? "..." : "Aceptar"}
              </TouchButton>
            </div>
          );
        })}
      </div>
    </div>
  );
}
