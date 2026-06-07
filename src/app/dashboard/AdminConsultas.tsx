"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import LoadingButton from "@/components/ui/LoadingButton";

type Consulta = {
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
};

const ESTADOS = ["esperando", "aceptada", "en_curso", "completada", "cancelada"];

function formatHora(fecha: string) {
  if (!fecha) return "—";
  const d = new Date(fecha);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Argentina/Buenos_Aires",
  });
}

function estadoDot(estado: string) {
  switch (estado) {
    case "esperando": return "bg-[#BA7517]";
    case "aceptada": return "bg-[#378ADD]";
    case "en_curso": return "bg-[#1D9E75]";
    case "completada": return "bg-[#888780]";
    case "cancelada": return "bg-[#E24B4A]";
    default: return "bg-[#888780]";
  }
}

export default function AdminConsultas({
  consultas: consultasIniciales,
  medicoId,
}: {
  consultas: Consulta[];
  medicoId: string;
}) {
  const [consultas, setConsultas] = useState(consultasIniciales);
  const [actualizando, setActualizando] = useState<string | null>(null);
  const [eliminando, setEliminando] = useState<string | null>(null);
  const [confirmandoEliminar, setConfirmandoEliminar] = useState<string | null>(null);

  useEffect(() => {
    setConsultas(consultasIniciales);
  }, [consultasIniciales]);

  useEffect(() => {
    const supabase = createClient();

    // Sin filtro: los filtros por columna non-PK fallan en Supabase Realtime.
    // Filtramos por medico_id en JS.
    const channel = supabase
      .channel(`admin-consultas-${medicoId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "consultas" },
        async (payload) => {
          if (payload.eventType === "DELETE") {
            // payload.old solo trae PK; el filter en JS no aplica para DELETE.
            // setConsultas filtra por id, así que es seguro llamarlo siempre.
            const old = payload.old as { id: string };
            setConsultas((prev) => prev.filter((c) => c.id !== old.id));
            return;
          }

          const row = payload.new as {
            id: string;
            medico_id: string;
            especialidad: string;
            estado: string;
            created_at: string;
            paciente_id: string;
            motivo_consulta: string | null;
            sintomas: string[] | null;
            sala_video_url: string | null;
          };

          // Filtrar en JS: ignorar consultas de otros médicos
          if (row.medico_id !== medicoId) return;

          if (payload.eventType === "UPDATE") {
            setConsultas((prev) =>
              prev.map((c) =>
                c.id === row.id
                  ? { ...c, estado: row.estado, sala_video_url: row.sala_video_url }
                  : c
              )
            );
          }

          if (payload.eventType === "INSERT") {
            const { data: paciente } = await supabase
              .from("pacientes")
              .select("id, nombre_completo")
              .eq("user_id", row.paciente_id)
              .single();

            setConsultas((prev) => {
              if (prev.some((c) => c.id === row.id)) return prev;
              return [
                {
                  id: row.id,
                  especialidad: row.especialidad,
                  estado: row.estado,
                  created_at: row.created_at,
                  motivo_consulta: row.motivo_consulta,
                  sintomas: row.sintomas,
                  sala_video_url: row.sala_video_url,
                  paciente_nombre: paciente?.nombre_completo ?? "—",
                  paciente_tabla_id: paciente?.id ?? null,
                  medico_nombre: "Yo",
                },
                ...prev,
              ];
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [medicoId]);

  async function handleCambiarEstado(id: string, nuevoEstado: string) {
    setActualizando(id);
    const supabase = createClient();
    await supabase.from("consultas").update({ estado: nuevoEstado }).eq("id", id);
    setConsultas((prev) =>
      prev.map((c) => (c.id === id ? { ...c, estado: nuevoEstado } : c))
    );
    setActualizando(null);
  }

  async function handleEliminar(id: string) {
    setConfirmandoEliminar(null);
    setEliminando(id);
    const supabase = createClient();
    await supabase.from("consultas").delete().eq("id", id);
    setConsultas((prev) => prev.filter((c) => c.id !== id));
    setEliminando(null);
  }

  return (
    <div
      className="rounded-xl bg-white p-5"
      style={{ border: "0.5px solid #e5e7eb" }}
    >
      <p className="text-xs font-medium tracking-wide text-gray-400">
        ADMINISTRACIÓN
      </p>
      <p className="mt-0.5 text-xs text-gray-400">
        {consultas.length} consulta{consultas.length !== 1 ? "s" : ""}
      </p>

      {consultas.length === 0 ? (
        <p className="mt-4 text-center text-xs text-gray-400">
          Sin consultas
        </p>
      ) : (
        <div className="mt-4 space-y-2">
          {consultas.map((c) => (
            <div key={c.id} className="rounded-lg p-3 hover:bg-gray-50">
              <div className="flex items-center gap-2">
                <span
                  className={`inline-block h-1.5 w-1.5 rounded-full ${estadoDot(c.estado)}`}
                />
                {c.paciente_tabla_id ? (
                  <a href={`/medico/paciente/${c.paciente_tabla_id}`} className="flex-1 truncate text-xs font-medium text-[#378ADD] hover:underline">
                    {c.paciente_nombre}
                  </a>
                ) : (
                  <span className="flex-1 truncate text-xs font-medium text-gray-900">
                    {c.paciente_nombre}
                  </span>
                )}
                <span className="text-[10px] text-gray-400">
                  {formatHora(c.created_at)}
                </span>
              </div>

              <div className="mt-1.5 flex items-center gap-2">
                <select
                  value={c.estado}
                  disabled={actualizando === c.id}
                  onChange={(e) => handleCambiarEstado(c.id, e.target.value)}
                  className="rounded bg-gray-50 px-1.5 py-1 text-[10px] text-gray-600 focus:outline-none disabled:opacity-50"
                >
                  {ESTADOS.map((e) => (
                    <option key={e} value={e}>{e}</option>
                  ))}
                </select>
                <LoadingButton
                  isLoading={eliminando === c.id}
                  onClick={() => setConfirmandoEliminar(c.id)}
                  className="text-[10px] text-gray-400 hover:text-red-500 disabled:opacity-50"
                >
                  eliminar
                </LoadingButton>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Dialog de eliminación — reemplaza window.confirm() que Chrome suprime en páginas con iframes cross-origin */}
      {confirmandoEliminar && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: "rgba(0,0,0,0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px",
          }}
        >
          <div
            style={{
              background: "white",
              borderRadius: "16px",
              padding: "24px",
              maxWidth: "360px",
              width: "100%",
            }}
          >
            <h3 style={{ fontSize: "16px", fontWeight: 600, color: "#111", marginBottom: "8px" }}>
              Eliminar consulta
            </h3>
            <p style={{ fontSize: "14px", color: "#666", marginBottom: "24px" }}>
              ¿Seguro que querés eliminar esta consulta? Esta acción no se puede deshacer.
            </p>
            <div style={{ display: "flex", gap: "12px" }}>
              <button
                onClick={() => setConfirmandoEliminar(null)}
                style={{
                  flex: 1,
                  padding: "12px",
                  borderRadius: "10px",
                  border: "none",
                  background: "#378ADD",
                  color: "white",
                  fontSize: "14px",
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                No, volver
              </button>
              <button
                onClick={() => handleEliminar(confirmandoEliminar)}
                style={{
                  flex: 1,
                  padding: "12px",
                  borderRadius: "10px",
                  border: "1px solid #E24B4A",
                  background: "transparent",
                  color: "#E24B4A",
                  fontSize: "14px",
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                Sí, eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
