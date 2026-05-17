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

type Item = { label: string; done: boolean; anchor?: string };

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
    { label: "Nombre completo", done: !!nombreCompleto?.trim(), anchor: "nombre" },
    { label: "Especialidad", done: !!especialidad?.trim(), anchor: "especialidad" },
    { label: "Matrícula", done: !!(numeroMatricula?.trim() && tipoMatricula?.trim()), anchor: "matricula" },
    { label: "Teléfono profesional", done: !!telefono?.trim(), anchor: "telefono" },
    { label: "Foto de perfil", done: !!fotoUrl?.trim(), anchor: "foto" },
    { label: "Domicilio del consultorio", done: !!domicilioConsultorio?.trim(), anchor: "domicilio" },
  ];

  const completados = items.filter((i) => i.done).length;
  const total = items.length;
  const porcentaje = Math.round((completados / total) * 100);
  const faltantes = items.filter((i) => !i.done);

  return (
    <div className="mb-4 rounded-xl bg-white p-5" style={{ border: "0.5px solid #e5e7eb" }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-900">Completá tu perfil</p>
        <p className="text-sm font-medium text-gray-500">{porcentaje}%</p>
      </div>

      {/* Barra de progreso */}
      <div className="mt-3 h-1.5 w-full rounded-full bg-gray-100">
        <div
          className="h-1.5 rounded-full bg-[#1D9E75] transition-all duration-500"
          style={{ width: `${porcentaje}%` }}
        />
      </div>

      {/* Items faltantes */}
      <div className="mt-4 space-y-3">
        {faltantes.map((item) => (
          <div key={item.label} className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="inline-block h-2 w-2 rounded-full bg-[#D85A30]" />
              <span className="text-sm text-gray-700">{item.label}</span>
            </div>
            <Link
              href={`/medico/perfil#${item.anchor}`}
              className="text-sm font-medium text-[#378ADD]"
            >
              Agregar →
            </Link>
          </div>
        ))}

        {/* Items completos (colapsados) */}
        {completados > 0 && (
          <div className="flex items-center gap-2.5">
            <span className="inline-block h-2 w-2 rounded-full bg-[#1D9E75]" />
            <span className="text-sm text-gray-500">{completados} dato{completados !== 1 ? "s" : ""} completo{completados !== 1 ? "s" : ""}</span>
          </div>
        )}
      </div>
    </div>
  );
}
