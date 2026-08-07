"use client";

import { useState } from "react";
import {
  AREAS_ATENCION,
  type AreaAtencion,
  textoArea,
  validarAreas,
} from "@/lib/areas-atencion";

// Sección "Áreas de atención" del perfil del médico (decisión Diego 07/08/2026).
//
// El médico activa un área ADICIONAL a su especialidad (hoy: Adolescencia) y declara
// él mismo el rango de edad. Es informativo: le cuenta al paciente a quién atiende.
// No habilita ni bloquea nada.
//
// Componente controlado: el estado y el guardado viven en PerfilClient, para que el
// médico siga usando UN SOLO botón "Guardar cambios" (regla de UX simple).
export default function AreasAtencion({
  areas,
  onChange,
  error,
}: {
  areas: AreaAtencion[];
  onChange: (areas: AreaAtencion[]) => void;
  error?: string | null;
}) {
  // Las edades se editan como texto para que el médico pueda borrar el campo y
  // reescribirlo (con números "puros" el input se pelea con el borrado).
  const [borrador, setBorrador] = useState<Record<string, { desde: string; hasta: string }>>(() => {
    const inicial: Record<string, { desde: string; hasta: string }> = {};
    for (const a of areas) inicial[a.area] = { desde: String(a.edad_desde), hasta: String(a.edad_hasta) };
    return inicial;
  });

  function aNumero(v: string): number {
    const t = v.trim();
    if (!t) return NaN;
    return Number(t);
  }

  function emitir(next: Record<string, { desde: string; hasta: string }>, activas: string[]) {
    onChange(
      activas.map((id) => ({
        area: id,
        edad_desde: aNumero(next[id]?.desde ?? ""),
        edad_hasta: aNumero(next[id]?.hasta ?? ""),
      }))
    );
  }

  function toggleArea(id: string, sugerido: { desde: number; hasta: number }) {
    const estaActiva = areas.some((a) => a.area === id);
    if (estaActiva) {
      const activas = areas.filter((a) => a.area !== id).map((a) => a.area);
      emitir(borrador, activas);
      return;
    }
    const next = {
      ...borrador,
      [id]: borrador[id] ?? { desde: String(sugerido.desde), hasta: String(sugerido.hasta) },
    };
    setBorrador(next);
    emitir(next, [...areas.map((a) => a.area), id]);
  }

  function cambiarEdad(id: string, campo: "desde" | "hasta", valor: string) {
    // Solo dígitos: evita comas, puntos y signos que después dan un error feo.
    const limpio = valor.replace(/[^0-9]/g, "").slice(0, 3);
    const next = { ...borrador, [id]: { ...(borrador[id] ?? { desde: "", hasta: "" }), [campo]: limpio } };
    setBorrador(next);
    emitir(next, areas.map((a) => a.area));
  }

  return (
    <div id="areas-atencion" className="mt-4 rounded-xl bg-white p-6" style={{ border: "0.5px solid #e5e7eb" }}>
      <p className="text-xs font-medium tracking-wide text-gray-400 uppercase">ÁREAS DE ATENCIÓN</p>
      <p className="mt-1 text-xs text-gray-400">
        Además de tu especialidad, podés contarle al paciente si atendés un grupo de edad en
        particular. Es informativo: no cambia quién puede reservarte un turno.
      </p>

      <div className="mt-5 space-y-5">
        {AREAS_ATENCION.map((def) => {
          const activa = areas.find((a) => a.area === def.id);
          const valores = borrador[def.id] ?? { desde: "", hasta: "" };
          const previa = activa ? textoArea({ ...activa }) : null;
          const previaValida = activa ? validarAreas([activa]) === null : false;

          return (
            <div key={def.id}>
              <button
                type="button"
                onClick={() => toggleArea(def.id, def.sugerido)}
                className="flex w-full items-center gap-3 text-left"
                style={{ minHeight: "44px" }}
                aria-pressed={!!activa}
              >
                <div
                  className="shrink-0 transition-colors duration-200"
                  style={{
                    position: "relative",
                    width: 48,
                    height: 26,
                    borderRadius: 13,
                    backgroundColor: activa ? "#378ADD" : "#d1d5db",
                  }}
                >
                  <div
                    className="absolute top-[3px] transition-all duration-200"
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 10,
                      backgroundColor: "white",
                      left: activa ? 25 : 3,
                      boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                    }}
                  />
                </div>
                <span className="text-sm font-medium text-gray-700">{def.etiqueta}</span>
              </button>
              <p className="mt-1 text-xs text-gray-400">{def.descripcion}</p>

              {activa && (
                <div className="mt-3 rounded-lg bg-[#f8f9fa] p-4">
                  <p className="text-xs text-gray-500">¿Desde qué edad hasta qué edad atendés?</p>
                  <div className="mt-2 flex items-end gap-3">
                    <div className="flex-1">
                      <label className="text-xs text-gray-400" htmlFor={`${def.id}-desde`}>
                        Desde (años)
                      </label>
                      <input
                        id={`${def.id}-desde`}
                        type="text"
                        inputMode="numeric"
                        value={valores.desde}
                        onChange={(e) => cambiarEdad(def.id, "desde", e.target.value)}
                        placeholder={String(def.sugerido.desde)}
                        className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#378ADD]/40"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="text-xs text-gray-400" htmlFor={`${def.id}-hasta`}>
                        Hasta (años)
                      </label>
                      <input
                        id={`${def.id}-hasta`}
                        type="text"
                        inputMode="numeric"
                        value={valores.hasta}
                        onChange={(e) => cambiarEdad(def.id, "hasta", e.target.value)}
                        placeholder={String(def.sugerido.hasta)}
                        className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#378ADD]/40"
                      />
                    </div>
                  </div>
                  {previaValida && previa && (
                    <p className="mt-3 text-xs text-gray-500">
                      El paciente va a ver: <span className="font-medium text-gray-700">{previa}</span>
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {error && (
        <p className="mt-4 text-sm font-medium" style={{ color: "#E24B4A" }}>
          {error}
        </p>
      )}
    </div>
  );
}
