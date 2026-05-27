"use client";

import Link from "next/link";

interface Props {
  perfilCompleto: boolean;
  telefono: string | null;
  fotoUrl: string | null;
  domicilioConsultorio: string | null;
  nombreCompleto: string | null;
  especialidad: string | null;
  numeroMatricula: string | null;
  tipoMatricula: string | null;
}

type Item = {
  label: string;
  done: boolean;
  anchor?: string;
  /** true = impide activar Consulta Inmediata (rojo). false = recomendado (amarillo). */
  blocking: boolean;
};

// Colores del design system
const COLOR = {
  bloqueante: "#E24B4A",
  recomendado: "#BA7517",
  completo: "#1D9E75",
  cta: "#378ADD",
} as const;

export default function PanelProgresoPerfil({
  perfilCompleto,
  telefono,
  fotoUrl,
  domicilioConsultorio,
  nombreCompleto,
  especialidad,
  numeroMatricula,
  tipoMatricula,
}: Props) {
  if (perfilCompleto) return null;

  const items: Item[] = [
    // Bloqueantes (rojo) — impiden CI
    { label: "Nombre completo", done: !!nombreCompleto?.trim(), anchor: "nombre", blocking: true },
    { label: "Especialidad", done: !!especialidad?.trim(), anchor: "especialidad", blocking: true },
    { label: "Matrícula", done: !!(numeroMatricula?.trim() && tipoMatricula?.trim()), anchor: "matricula", blocking: true },
    { label: "Teléfono profesional", done: !!telefono?.trim(), anchor: "telefono", blocking: true },
    { label: "Domicilio del consultorio", done: !!domicilioConsultorio?.trim(), anchor: "domicilio", blocking: true },
    // Recomendados (amarillo) — no bloquean CI
    { label: "Foto de perfil", done: !!fotoUrl?.trim(), anchor: "foto", blocking: false },
  ];

  const completados = items.filter((i) => i.done).length;
  const total = items.length;
  const porcentaje = Math.round((completados / total) * 100);

  // Separar por estado: bloqueantes faltantes → recomendados faltantes → completos
  const faltantesBloqueantes = items.filter((i) => !i.done && i.blocking);
  const faltantesRecomendados = items.filter((i) => !i.done && !i.blocking);

  return (
    <div className="mb-4 rounded-xl bg-white p-5" style={{ border: "0.5px solid #e5e7eb" }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-900">Completá tu perfil</p>
        <p className="text-sm font-medium text-gray-500">{porcentaje}%</p>
      </div>

      {/* Subtítulo condicional */}
      {faltantesBloqueantes.length > 0 ? (
        <p className="mt-1 text-xs" style={{ color: COLOR.bloqueante }}>
          {faltantesBloqueantes.length} dato{faltantesBloqueantes.length !== 1 ? "s" : ""} requerido{faltantesBloqueantes.length !== 1 ? "s" : ""} para atender
        </p>
      ) : faltantesRecomendados.length > 0 ? (
        <p className="mt-1 text-xs" style={{ color: COLOR.recomendado }}>
          Tu perfil funciona, pero podés mejorarlo
        </p>
      ) : null}

      {/* Barra de progreso */}
      <div className="mt-3 h-1.5 w-full rounded-full bg-gray-100">
        <div
          className="h-1.5 rounded-full bg-[#378ADD] transition-all duration-500"
          style={{ width: `${porcentaje}%` }}
        />
      </div>

      {/* Items faltantes */}
      <div className="mt-4 space-y-3">
        {/* Bloqueantes primero (rojo) */}
        {faltantesBloqueantes.map((item) => (
          <div key={item.label} className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: COLOR.bloqueante }}
              />
              <span className="text-sm" style={{ color: "#991b1b" }}>{item.label}</span>
            </div>
            <Link
              href={`/medico/perfil#${item.anchor}`}
              className="text-sm font-medium"
              style={{ color: COLOR.cta }}
            >
              Completar →
            </Link>
          </div>
        ))}

        {/* Recomendados después (amarillo) */}
        {faltantesRecomendados.map((item) => (
          <div key={item.label} className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: COLOR.recomendado }}
              />
              <span className="text-sm text-gray-700">{item.label}</span>
            </div>
            <Link
              href={`/medico/perfil#${item.anchor}`}
              className="text-sm font-medium"
              style={{ color: COLOR.cta }}
            >
              Agregar →
            </Link>
          </div>
        ))}

        {/* Items completos (colapsados) */}
        {completados > 0 && (
          <div className="flex items-center gap-2.5">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: COLOR.completo }}
            />
            <span className="text-sm text-gray-500">
              {completados} dato{completados !== 1 ? "s" : ""} completo{completados !== 1 ? "s" : ""}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
