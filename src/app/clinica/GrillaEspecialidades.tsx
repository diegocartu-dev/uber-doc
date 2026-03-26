"use client";

import { useState } from "react";

type Medico = {
  especialidad: string;
  modalidad_atencion: string;
  nombre_completo: string;
};

type Especialidad = { nombre: string; icono: string };

type Disponibilidad = "disponible" | "espera" | "programada" | "sin_medicos";

const ESPECIALIDADES: Especialidad[] = [
  { nombre: "Clínica médica", icono: "🏥" },
  { nombre: "Alergia e inmunología", icono: "🤧" },
  { nombre: "Anatomía patológica", icono: "🔬" },
  { nombre: "Anestesiología", icono: "💉" },
  { nombre: "Cardiología", icono: "❤️" },
  { nombre: "Cirugía cardiovascular", icono: "🫀" },
  { nombre: "Cirugía general", icono: "🔪" },
  { nombre: "Cirugía pediátrica", icono: "👶" },
  { nombre: "Cirugía plástica y reparadora", icono: "✨" },
  { nombre: "Cirugía torácica", icono: "🫁" },
  { nombre: "Coloproctología", icono: "🩻" },
  { nombre: "Dermatología", icono: "🧴" },
  { nombre: "Diagnóstico por imágenes", icono: "📷" },
  { nombre: "Endocrinología", icono: "⚗️" },
  { nombre: "Farmacología clínica", icono: "💊" },
  { nombre: "Fisiatría", icono: "🦿" },
  { nombre: "Gastroenterología", icono: "🫃" },
  { nombre: "Genética médica", icono: "🧬" },
  { nombre: "Geriatría", icono: "👴" },
  { nombre: "Ginecología", icono: "🩷" },
  { nombre: "Hematología", icono: "🩸" },
  { nombre: "Hemoterapia e inmunohematología", icono: "🅰️" },
  { nombre: "Hepatología", icono: "🫘" },
  { nombre: "Infectología", icono: "🦠" },
  { nombre: "Mastología", icono: "🎀" },
  { nombre: "Medicina del deporte", icono: "🏃" },
  { nombre: "Medicina del trabajo", icono: "🏗️" },
  { nombre: "Medicina familiar", icono: "👨‍👩‍👧‍👦" },
  { nombre: "Medicina legal", icono: "⚖️" },
  { nombre: "Medicina nuclear", icono: "☢️" },
  { nombre: "Nefrología", icono: "🫘" },
  { nombre: "Neonatología", icono: "🍼" },
  { nombre: "Neumonología", icono: "🫁" },
  { nombre: "Neurocirugía", icono: "🧠" },
  { nombre: "Neurología", icono: "🧠" },
  { nombre: "Nutrición", icono: "🥗" },
  { nombre: "Obstetricia", icono: "🤰" },
  { nombre: "Oftalmología", icono: "👁️" },
  { nombre: "Oncología", icono: "🎗️" },
  { nombre: "Ortopedia y traumatología", icono: "🦴" },
  { nombre: "Otorrinolaringología", icono: "👂" },
  { nombre: "Patología", icono: "🔬" },
  { nombre: "Pediatría", icono: "🧒" },
  { nombre: "Psiquiatría", icono: "🧩" },
  { nombre: "Radioterapia", icono: "☢️" },
  { nombre: "Reumatología", icono: "🦴" },
  { nombre: "Terapia intensiva", icono: "🚑" },
  { nombre: "Toxicología", icono: "☠️" },
  { nombre: "Urología", icono: "🫀" },
];

function semaforo(estado: Disponibilidad) {
  switch (estado) {
    case "disponible":
      return { color: "bg-green-500", texto: "Disponible ahora" };
    case "espera":
      return { color: "bg-yellow-400", texto: "Con espera" };
    case "programada":
      return { color: "bg-red-500", texto: "Solo programada" };
    case "sin_medicos":
      return { color: "bg-gray-300", texto: "Sin médicos" };
  }
}

function calcularDisponibilidad(
  especialidad: string,
  medicos: Medico[]
): Disponibilidad {
  const medicosDeLaEsp = medicos.filter(
    (m) => m.especialidad === especialidad
  );

  if (especialidad === "Clínica médica" && medicosDeLaEsp.length === 0) {
    return "programada";
  }

  if (medicosDeLaEsp.length === 0) return "sin_medicos";

  const tieneInmediata = medicosDeLaEsp.some(
    (m) =>
      m.modalidad_atencion === "inmediata" || m.modalidad_atencion === "ambas"
  );
  const soloProgramada = medicosDeLaEsp.every(
    (m) => m.modalidad_atencion === "programada"
  );

  if (tieneInmediata && medicosDeLaEsp.length >= 2) return "disponible";
  if (tieneInmediata) return "espera";
  if (soloProgramada) return "programada";
  return "espera";
}

function normalize(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export default function GrillaEspecialidades({
  medicos,
}: {
  medicos: Medico[];
}) {
  const [busqueda, setBusqueda] = useState("");

  const termino = normalize(busqueda.trim());

  // Especialidades que matchean por nombre de especialidad
  const espConMatch = new Set<string>();
  // Especialidades que matchean por nombre de médico
  const espPorMedico = new Set<string>();

  if (termino) {
    for (const esp of ESPECIALIDADES) {
      if (normalize(esp.nombre).includes(termino)) {
        espConMatch.add(esp.nombre);
      }
    }
    for (const m of medicos) {
      if (normalize(m.nombre_completo).includes(termino)) {
        espPorMedico.add(m.especialidad);
      }
    }
  }

  const especialidadesFiltradas =
    termino === ""
      ? ESPECIALIDADES
      : ESPECIALIDADES.filter(
          (esp) => espConMatch.has(esp.nombre) || espPorMedico.has(esp.nombre)
        );

  return (
    <>
      {/* Buscador */}
      <div className="relative mb-6">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-base">
          🔍
        </span>
        <input
          type="text"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por especialidad o nombre de médico..."
          className="w-full rounded-xl border border-gray-300 bg-white py-3 pl-10 pr-4 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {/* Leyenda del semáforo */}
      <div className="mb-6 flex flex-wrap gap-4 text-sm text-gray-600">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full bg-green-500" />
          Disponible ahora
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full bg-yellow-400" />
          Con espera
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full bg-red-500" />
          Solo programada
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full bg-gray-300" />
          Sin médicos
        </span>
      </div>

      {/* Resultado vacío */}
      {especialidadesFiltradas.length === 0 && (
        <p className="py-12 text-center text-sm text-gray-500">
          No se encontraron especialidades para &quot;{busqueda}&quot;
        </p>
      )}

      {/* Grilla */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {especialidadesFiltradas.map((esp) => {
          const estado = calcularDisponibilidad(esp.nombre, medicos);
          const { color, texto } = semaforo(estado);
          const sinMedicos = estado === "sin_medicos";
          const soloProgramada = estado === "programada" || sinMedicos;

          // Médicos que matchean en esta especialidad
          const medicosMatch =
            termino && espPorMedico.has(esp.nombre)
              ? medicos.filter(
                  (m) =>
                    m.especialidad === esp.nombre &&
                    normalize(m.nombre_completo).includes(termino)
                )
              : [];

          return (
            <div
              key={esp.nombre}
              className={`rounded-xl border bg-white p-5 shadow-sm transition ${
                sinMedicos
                  ? "border-gray-200 opacity-60"
                  : "border-gray-200 hover:shadow-md"
              }`}
            >
              <div className="flex items-start justify-between">
                <span className="text-3xl">{esp.icono}</span>
                <span className="flex items-center gap-1.5 text-xs text-gray-500">
                  <span
                    className={`inline-block h-2.5 w-2.5 rounded-full ${color}`}
                  />
                  {texto}
                </span>
              </div>

              <h3 className="mt-3 text-sm font-semibold text-gray-900">
                {esp.nombre}
              </h3>

              {/* Médicos que matchean la búsqueda */}
              {medicosMatch.length > 0 && (
                <p className="mt-1 text-xs text-blue-600">
                  {medicosMatch.map((m) => m.nombre_completo).join(", ")}
                </p>
              )}

              <div className="mt-4 flex gap-2">
                <button
                  disabled={soloProgramada}
                  className="flex-1 rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500"
                >
                  Consulta ahora
                </button>
                <button
                  disabled={sinMedicos}
                  className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-400"
                >
                  Agendar turno
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
