"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Medico = {
  id: string;
  especialidad: string;
  modalidad_atencion: string;
  nombre_completo: string;
  disponible: boolean;
  disponible_desde: string | null;
  disponible_hasta: string | null;
  precio_consulta: number;
  duracion_consulta: number;
};

type ConsultaEspera = { medico_id: string };

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
      return { color: "bg-[#1D9E75]", texto: "Disponible ahora" };
    case "espera":
      return { color: "bg-[#BA7517]", texto: "Con espera" };
    case "programada":
      return { color: "bg-[#D85A30]", texto: "Solo programada" };
    case "sin_medicos":
      return { color: "bg-[#888780]", texto: "Sin disponibilidad" };
  }
}

function normalizeTime(t: string): string {
  // DB returns "HH:MM:SS", UI uses "HH:MM" — normalize to "HH:MM"
  return t.slice(0, 5);
}

function estaEnHorario(medico: Medico): boolean {
  if (!medico.disponible) return false;
  if (!medico.disponible_desde || !medico.disponible_hasta)
    return medico.disponible;

  const ahora = new Date();
  const hh = ahora.getHours().toString().padStart(2, "0");
  const mm = ahora.getMinutes().toString().padStart(2, "0");
  const horaActual = `${hh}:${mm}`;

  return (
    horaActual >= normalizeTime(medico.disponible_desde) &&
    horaActual <= normalizeTime(medico.disponible_hasta)
  );
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

  // Un medico esta disponible para consulta inmediata si:
  // - tiene disponible=true (toggle activo) Y esta en horario, O
  // - tiene modalidad inmediata/ambas Y esta en horario
  const disponiblesAhora = medicosDeLaEsp.filter((m) => estaEnHorario(m));

  if (disponiblesAhora.length > 0) return "disponible";

  // Tiene medicos con capacidad de inmediata pero no estan en horario ahora
  const tieneInmediata = medicosDeLaEsp.some(
    (m) =>
      m.disponible ||
      m.modalidad_atencion === "inmediata" ||
      m.modalidad_atencion === "ambas"
  );
  if (tieneInmediata) return "espera";

  return "programada";
}

function normalize(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function formatPrecio(precio: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(precio);
}

export default function GrillaEspecialidades({
  medicos,
  consultasEspera,
}: {
  medicos: Medico[];
  consultasEspera: ConsultaEspera[];
}) {
  const [busqueda, setBusqueda] = useState("");
  const [verMas, setVerMas] = useState(false);
  const router = useRouter();
  const [modalEspecialidad, setModalEspecialidad] = useState<string | null>(null);
  const [modalModo, setModalModo] = useState<"inmediata" | "turno">("inmediata");

  const termino = normalize(busqueda.trim());

  const espConMatch = new Set<string>();
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

  // Agrupar: básicas, con médicos, sin médicos
  const BASICAS = ["Clínica médica", "Pediatría", "Ginecología", "Psiquiatría", "Dermatología", "Cardiología"];
  const espConMedicos = new Set(medicos.map((m) => m.especialidad));

  // Básicas CON médicos van primero (orden fijo)
  const basicasConMedicos = especialidadesFiltradas
    .filter((e) => BASICAS.includes(e.nombre) && espConMedicos.has(e.nombre))
    .sort((a, b) => BASICAS.indexOf(a.nombre) - BASICAS.indexOf(b.nombre));

  // Otras con médicos (aleatorio)
  const otrasConMedicos = especialidadesFiltradas
    .filter((e) => !BASICAS.includes(e.nombre) && espConMedicos.has(e.nombre))
    .sort(() => Math.random() - 0.5);

  // Básicas SIN médicos (después de las que tienen)
  const basicasSinMedicos = especialidadesFiltradas
    .filter((e) => BASICAS.includes(e.nombre) && !espConMedicos.has(e.nombre))
    .sort((a, b) => BASICAS.indexOf(a.nombre) - BASICAS.indexOf(b.nombre));

  // Resto sin médicos (colapsadas)
  const sinMedicos = especialidadesFiltradas
    .filter((e) => !BASICAS.includes(e.nombre) && !espConMedicos.has(e.nombre))
    .sort(() => Math.random() - 0.5);

  const espVisibles = termino
    ? especialidadesFiltradas
    : [...basicasConMedicos, ...otrasConMedicos, ...basicasSinMedicos, ...(verMas ? sinMedicos : [])];

  const tieneSinMedicos = !termino && sinMedicos.length > 0;

  // Contar esperas por médico
  const esperasPorMedico = new Map<string, number>();
  for (const c of consultasEspera) {
    esperasPorMedico.set(
      c.medico_id,
      (esperasPorMedico.get(c.medico_id) ?? 0) + 1
    );
  }

  // Médicos para el modal: inmediata incluye disponible=true O modalidad inmediata/ambas
  const medicosDelModal = modalEspecialidad
    ? medicos.filter((m) =>
        m.especialidad === modalEspecialidad &&
        (modalModo === "turno" || m.disponible || m.modalidad_atencion === "inmediata" || m.modalidad_atencion === "ambas")
      )
    : [];

  function handleElegirMedico(medicoId: string, especialidad: string) {
    router.push(`/triage?medicoId=${encodeURIComponent(medicoId)}&especialidad=${encodeURIComponent(especialidad)}`);
  }

  return (
    <>
      {/* Buscador */}
      <div className="relative mb-6">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-base text-gray-400">
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
          <span className="inline-block h-3 w-3 rounded-full bg-[#1D9E75]" />
          Disponible ahora
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full bg-[#BA7517]" />
          Con espera
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full bg-[#D85A30]" />
          Solo programada
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full bg-[#888780]" />
          Sin disponibilidad
        </span>
      </div>

      {/* Resultado vacío */}
      {espVisibles.length === 0 && (
        <p className="py-12 text-center text-sm text-gray-500">
          No se encontraron especialidades para &quot;{busqueda}&quot;
        </p>
      )}

      {/* Grilla */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {espVisibles.map((esp) => {
          const estado = calcularDisponibilidad(esp.nombre, medicos);
          const { color, texto } = semaforo(estado);
          const sinMedicos = estado === "sin_medicos";

          // El botón se habilita si hay al menos un médico con consulta inmediata
          // disponible=true (toggle activo) O modalidad inmediata/ambas
          const tieneInmediata = medicos.some(
            (m) =>
              m.especialidad === esp.nombre &&
              (m.disponible || m.modalidad_atencion === "inmediata" || m.modalidad_atencion === "ambas")
          );
          const botonConsultaDeshabilitado = !tieneInmediata;

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
              className={`rounded-xl border bg-white shadow-sm transition ${
                sinMedicos
                  ? "border-gray-200 opacity-60 px-5 pt-5 pb-3"
                  : "border-gray-200 hover:shadow-md p-5"
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

              <h3 className={`mt-3 text-sm font-semibold ${sinMedicos ? "text-gray-500" : "text-gray-900"}`}>
                {esp.nombre}
              </h3>

              {(() => {
                const medicosEsp = medicos.filter((m) => m.especialidad === esp.nombre);
                if (medicosEsp.length === 0) return null;
                const minPrecio = Math.min(...medicosEsp.map((m) => m.precio_consulta));
                const minDuracion = medicosEsp.find((m) => m.precio_consulta === minPrecio)?.duracion_consulta;
                return (
                  <p className="mt-1 text-xs font-medium text-gray-900">
                    {formatPrecio(minPrecio)}
                    {minDuracion && (
                      <span className="ml-1 font-normal text-gray-400">
                        · {minDuracion} min
                      </span>
                    )}
                  </p>
                );
              })()}

              {medicosMatch.length > 0 && (
                <p className="mt-1 text-xs text-blue-600">
                  {medicosMatch.map((m) => m.nombre_completo).join(", ")}
                </p>
              )}

              {sinMedicos ? (
                <p className="mt-4 text-xs text-gray-400">Sin disponibilidad</p>
              ) : (
                <div className="mt-4 flex gap-2">
                  <button
                    disabled={botonConsultaDeshabilitado}
                    onClick={() => { setModalModo("inmediata"); setModalEspecialidad(esp.nombre); }}
                    className="flex-1 rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500"
                  >
                    Consulta ahora
                  </button>
                  <button
                    onClick={() => {
                      const medicosEsp = medicos.filter((m) => m.especialidad === esp.nombre);
                      if (medicosEsp.length === 1) {
                        router.push(`/clinica/${medicosEsp[0].id}/turnos`);
                      } else {
                        setModalModo("turno");
                        setModalEspecialidad(esp.nombre);
                      }
                    }}
                    className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Agendar turno
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Ver más especialidades */}
      {tieneSinMedicos && (
        <button
          onClick={() => setVerMas(!verMas)}
          className="mt-4 w-full rounded-lg bg-gray-50 px-4 py-2.5 text-sm text-gray-400 hover:bg-gray-100 active:scale-95 active:opacity-80 transition-all duration-100"
          style={{ border: "0.5px solid #e5e7eb" }}
        >
          {verMas ? "▴ Ocultar especialidades sin médicos" : `▾ Ver ${sinMedicos.length} especialidades más`}
        </button>
      )}

      {/* Modal: Médicos disponibles */}
      {modalEspecialidad && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">
                {modalModo === "turno" ? "Agendar turno" : "Médicos disponibles"} — {modalEspecialidad}
              </h2>
              <button
                onClick={() => setModalEspecialidad(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            {medicosDelModal.length === 0 ? (
              <p className="mt-6 text-center text-sm text-gray-500">
                No hay médicos disponibles en este momento.
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                {medicosDelModal.map((m) => {
                  const enEspera = esperasPorMedico.get(m.id) ?? 0;
                  const tiempoEstimado = enEspera * m.duracion_consulta;
                  const disponibleAhora = estaEnHorario(m);

                  return (
                    <div
                      key={m.id}
                      className={`flex items-center justify-between rounded-xl border p-4 ${
                        disponibleAhora
                          ? "border-gray-200"
                          : "border-gray-100 opacity-60"
                      }`}
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-gray-900">
                            {m.nombre_completo}
                          </p>
                          <span
                            className={`inline-block h-2 w-2 rounded-full ${
                              disponibleAhora ? "bg-[#1D9E75]" : "bg-gray-300"
                            }`}
                          />
                        </div>
                        <p className="mt-0.5 text-sm text-gray-600">
                          {formatPrecio(m.precio_consulta)} ·{" "}
                          {m.duracion_consulta} min
                        </p>
                        <p className="mt-0.5 text-xs text-gray-500">
                          {!disponibleAhora ? (
                            <span className="text-gray-400">
                              No disponible ahora
                            </span>
                          ) : enEspera === 0 ? (
                            <span className="font-medium text-green-600">
                              Sin espera
                            </span>
                          ) : (
                            <>
                              {enEspera} paciente{enEspera !== 1 ? "s" : ""} en
                              espera · ~{tiempoEstimado} min
                            </>
                          )}
                        </p>
                      </div>
                      {modalModo === "turno" ? (
                        <a
                          href={`/clinica/${m.id}/turnos`}
                          className="shrink-0 rounded-lg bg-[#1D9E75] px-4 py-2 text-sm font-medium text-white hover:bg-[#178a64]"
                        >
                          Ver turnos
                        </a>
                      ) : (
                        <div className="flex shrink-0 flex-col gap-1.5">
                          <button
                            disabled={!disponibleAhora}
                            onClick={() => handleElegirMedico(m.id, modalEspecialidad!)}
                            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500"
                          >
                            Consulta ahora
                          </button>
                          <a
                            href={`/clinica/${m.id}/turnos`}
                            className="rounded-lg bg-gray-100 px-3 py-1.5 text-center text-xs font-medium text-gray-700 hover:bg-gray-200"
                          >
                            Agendar turno
                          </a>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <button
              onClick={() => setModalEspecialidad(null)}
              className="mt-4 w-full rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </>
  );
}
