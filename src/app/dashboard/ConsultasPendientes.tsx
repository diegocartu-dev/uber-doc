"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { aceptarConsulta } from "@/app/sala-espera/[consultaId]/actions";
import { soundPacienteEsperando } from "@/lib/sounds";

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
  const chimeRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(null);
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);

  useEffect(() => {
    setConsultas(consultasIniciales);
  }, [consultasIniciales]);

  // Timbre cada 30s
  useEffect(() => {
    if (chimeRef.current) clearInterval(chimeRef.current);
    if (consultas.length > 0) {
      chimeRef.current = setInterval(() => soundPacienteEsperando(), 30000);
    }
    return () => { if (chimeRef.current) clearInterval(chimeRef.current); };
  }, [consultas.length]);

  // Realtime
  useEffect(() => {
    const supabase = createClient();
    supabaseRef.current = supabase;

    async function setup() {
      const { data: { user }, error } = await supabase.auth.getUser();

      if (!user) return;

      const channel = supabase
        .channel(`pendientes-${medicoId}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "consultas", filter: `medico_id=eq.${medicoId}` },
          async (payload) => {
            const nueva = payload.new as {
              id: string;
              medico_id: string;
              especialidad: string;
              estado: string;
              created_at: string;
              paciente_id: string;
              motivo_consulta: string | null;
            };

            if (nueva.estado !== "esperando") return;

            soundPacienteEsperando();

            const pac = await fetchNombrePaciente(supabase, nueva.paciente_id);

            setConsultas((prev) => {
              if (prev.some((c) => c.id === nueva.id)) return prev;
              return [
                ...prev,
                {
                  id: nueva.id,
                  especialidad: nueva.especialidad,
                  estado: nueva.estado,
                  created_at: nueva.created_at,
                  paciente_nombre: pac.nombre,
                  paciente_tabla_id: pac.id,
                  motivo_consulta: nueva.motivo_consulta,
                  fecha_nacimiento: pac.nacimiento,
                },
              ];
            });
          }
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "consultas", filter: `medico_id=eq.${medicoId}` },
          (payload) => {
            const updated = payload.new as { id: string; estado: string };
            if (updated.estado !== "esperando") {
              setConsultas((prev) => prev.filter((c) => c.id !== updated.id));
            }
          }
        )
        .subscribe();

      channelRef.current = channel;
    }

    setup();

    return () => {
      if (channelRef.current && supabaseRef.current) {
        supabaseRef.current.removeChannel(channelRef.current);
      }
    };
  }, [medicoId]);

  function handleAceptar(consultaId: string) {
    startTransition(async () => {
      await aceptarConsulta(consultaId);
      setConsultas((prev) => prev.filter((c) => c.id !== consultaId));
    });
  }

  if (consultas.length === 0) return null;

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
              <button
                disabled={isPending}
                onClick={() => handleAceptar(c.id)}
                className="shrink-0 rounded-lg bg-gray-100 px-3.5 py-2 text-xs font-medium text-gray-700 transition hover:bg-gray-200 disabled:opacity-50"
              >
                Aceptar
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
