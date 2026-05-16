"use client";

import { useRouter } from "next/navigation";

type PacienteData = {
  nombre_completo: string | null;
  dni: string | null;
  fecha_nacimiento: string | null;
  sexo_dni: string | null;
  tiene_cobertura: boolean | null;
  obra_social: string | null;
  obra_social_nombre: string | null; // resolved from FK
  obra_social_otra: string | null;
  nro_afiliado: string | null;
  plan_obra_social: string | null;
};

type Props = {
  paciente: PacienteData;
  redirect: string;
  editUrl: string;
};

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

function formatFecha(fecha: string | null): string {
  if (!fecha) return "---";
  const [anio, mes, dia] = fecha.split("-");
  return `${parseInt(dia)} de ${MESES[parseInt(mes) - 1]} de ${anio}`;
}

export default function InfoMedicaForm({ paciente, redirect: redirectUrl, editUrl }: Props) {
  const router = useRouter();

  // Resolve display name: FK name > obra_social_otra > legacy obra_social
  const obraSocialDisplay =
    paciente.obra_social_nombre ??
    paciente.obra_social_otra ??
    paciente.obra_social?.trim() ??
    null;

  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <div className="mx-auto w-full max-w-lg flex-1 px-6 py-10">
        <div className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#378ADD]/10">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#378ADD" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4.8 2.3A.3.3 0 105 2H19a2 2 0 012 2v16a2 2 0 01-2 2H5a2 2 0 01-2-2V4a2 2 0 01.8-1.7z"/>
              <path d="M8 10h8"/><path d="M8 14h4"/>
              <circle cx="16" cy="18" r="2"/>
            </svg>
          </div>
          <h1 className="mt-4 text-lg font-medium text-gray-900">Tu información médica</h1>
          <p className="mt-1.5 text-sm text-gray-400">Estos datos se usan para confeccionar tus recetas y documentos médicos automáticamente. Si algo está mal, editalo antes de entrar a la consulta.</p>
        </div>

        <div className="mt-8 rounded-xl bg-[#f8f9fa] p-5 space-y-3 text-sm" style={{ border: "0.5px solid #e5e7eb" }}>
          <div className="flex justify-between">
            <span className="text-gray-500">Nombre</span>
            <span className="font-medium text-gray-900">{paciente.nombre_completo ?? "---"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">DNI</span>
            <span className="font-medium text-gray-900">{paciente.dni ?? "---"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Sexo (según DNI)</span>
            <span className="font-medium text-gray-900 capitalize">{paciente.sexo_dni ?? "---"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Fecha de nacimiento</span>
            <span className="font-medium text-gray-900">{formatFecha(paciente.fecha_nacimiento)}</span>
          </div>

          {/* ── Separador visual ── */}
          <div className="border-t border-gray-200 my-2" />

          <div className="flex justify-between">
            <span className="text-gray-500">Cobertura</span>
            <span className="font-medium text-gray-900">
              {paciente.tiene_cobertura ? "Sí" : "Particular"}
            </span>
          </div>
          {paciente.tiene_cobertura && (
            <>
              <div className="flex justify-between">
                <span className="text-gray-500">Obra social</span>
                <span className="font-medium text-gray-900">{obraSocialDisplay || "No especificado"}</span>
              </div>
              {paciente.plan_obra_social && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Plan</span>
                  <span className="font-medium text-gray-900">{paciente.plan_obra_social}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-500">Nro. afiliado</span>
                <span className="font-medium text-gray-900">{paciente.nro_afiliado?.trim() || "No especificado"}</span>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="sticky bottom-0 bg-white px-6 pb-6 pt-4" style={{ boxShadow: "0 -4px 12px rgba(0,0,0,0.04)" }}>
        <button
          onClick={() => router.push(redirectUrl)}
          className="w-full rounded-xl bg-[#378ADD] py-3.5 text-sm font-medium text-white active:scale-[0.97] transition-all duration-100"
        >
          Confirmar y entrar
        </button>
        <button
          onClick={() => router.push(editUrl)}
          className="mt-3 w-full text-center text-sm text-[#888780] hover:text-gray-600"
        >
          Editar datos
        </button>
      </div>
    </div>
  );
}
