"use client";

// Aviso: atenciones que terminaron SIN documentación entregada al paciente.
//
// Es la contracara visible del agujero medido el 08/08/2026: cuando una consulta
// se cierra sola (se cortó internet, el médico se fue, la cerró un cron), lo que
// el profesional escribió queda en el borrador y el paciente no recibe nada. Antes
// eso no se veía en ningún lado y aparecía dos meses después, en una auditoría.
//
// Va arriba de todo en el dashboard, en ámbar (pendiente), y cada fila lleva
// directo a la pantalla para completar y enviar. Si no hay nada pendiente, el
// componente no dibuja nada: no queremos un cartel vacío compitiendo por atención.

import { useEffect, useState } from "react";
import { capitalizarNombre } from "@/lib/utils/texto";

type Item = {
  id: string;
  canal: "consulta" | "turno";
  pacienteNombre: string;
  fechaLabel: string;
  cierreOrigen: string | null;
  tieneBorrador: boolean;
  url: string;
};

const AMBAR = "#BA7517";

function motivoCierre(origen: string | null): string | null {
  switch (origen) {
    case "desconexion":
      return "Se cortó la conexión";
    case "webhook_video":
      return "La videollamada quedó vacía";
    case "cierre_automatico":
    case "rejoin_expirado":
      return "La cerró el sistema";
    case "paciente":
      return "La cerró el paciente";
    default:
      return null;
  }
}

export default function DocumentacionPendiente() {
  const [items, setItems] = useState<Item[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const res = await fetch("/api/medico/atenciones-sin-documentar", { credentials: "include" });
        if (!res.ok) return;
        const data = await res.json();
        if (vivo && Array.isArray(data.items)) setItems(data.items);
      } catch {
        // Silencioso: el dashboard no se rompe por este aviso.
      } finally {
        if (vivo) setCargando(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);

  if (cargando || items.length === 0) return null;

  return (
    <div
      className="mt-4 overflow-hidden rounded-xl bg-white"
      style={{ border: "0.5px solid #e5e7eb", borderLeft: `4px solid ${AMBAR}` }}
    >
      <div className="px-4 py-3" style={{ background: `${AMBAR}0d` }}>
        <div className="flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: AMBAR }} />
          <p className="text-[13px] font-semibold uppercase tracking-wide" style={{ color: AMBAR }}>
            {items.length === 1
              ? "1 consulta sin documentación entregada"
              : `${items.length} consultas sin documentación entregada`}
          </p>
        </div>
        <p className="mt-1.5 text-[13px] leading-snug text-gray-600">
          Estas consultas terminaron y el paciente no recibió ningún documento. Podés emitirlo
          ahora y le llega en el momento.
        </p>
      </div>

      <div className="divide-y divide-gray-100">
        {items.map((item) => {
          const motivo = motivoCierre(item.cierreOrigen);
          return (
            <div
              key={`${item.canal}-${item.id}`}
              className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <p className="text-[15px] font-medium text-gray-900">
                    {capitalizarNombre(item.pacienteNombre)}
                  </p>
                  {item.tieneBorrador && (
                    <span
                      className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                      style={{ background: `${AMBAR}1f`, color: AMBAR }}
                    >
                      Tenés notas sin enviar
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-[13px] text-gray-500">
                  {item.canal === "turno" ? "Turno" : "Consulta"} del {item.fechaLabel}
                  {motivo ? ` · ${motivo}` : ""}
                </p>
              </div>

              <a
                href={item.url}
                className="shrink-0 rounded-lg px-4 py-2.5 text-center text-sm font-medium text-white transition-colors hover:bg-[#2d75c4] active:scale-95"
                style={{ backgroundColor: "#378ADD", minHeight: "44px", lineHeight: "24px" }}
              >
                Completar y enviar
              </a>
            </div>
          );
        })}
      </div>
    </div>
  );
}
