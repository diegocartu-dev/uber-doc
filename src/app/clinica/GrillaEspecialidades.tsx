"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Search, X, Building2, Microscope, Syringe, Heart, Baby, Sparkles,
  Stethoscope, Pipette, Pill, Activity, Brain, Apple, Eye, Ear,
  Bone, Ambulance, Dna, Ribbon, PersonStanding, Scale, Radiation,
  UserRound, FlaskConical,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

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

type Especialidad = { nombre: string; icon: LucideIcon };

type Disponibilidad = "disponible" | "espera" | "programada" | "sin_medicos";

const ICON_MAP: Record<string, LucideIcon> = {
  "Clinica medica": Stethoscope,
  "Alergia e inmunologia": FlaskConical,
  "Anatomia patologica": Microscope,
  "Anestesiologia": Syringe,
  "Cardiologia": Heart,
  "Cirugia cardiovascular": Heart,
  "Cirugia general": Activity,
  "Cirugia pediatrica": Baby,
  "Cirugia plastica y reparadora": Sparkles,
  "Dermatologia": Pipette,
  "Endocrinologia": FlaskConical,
  "Farmacologia clinica": Pill,
  "Gastroenterologia": Activity,
  "Genetica medica": Dna,
  "Geriatria": UserRound,
  "Ginecologia": Heart,
  "Hematologia": Pipette,
  "Infectologia": Microscope,
  "Mastologia": Ribbon,
  "Medicina del deporte": PersonStanding,
  "Medicina familiar": UserRound,
  "Medicina legal": Scale,
  "Medicina nuclear": Radiation,
  "Neurocirugia": Brain,
  "Neurologia": Brain,
  "Nutricion": Apple,
  "Oftalmologia": Eye,
  "Oncologia": Ribbon,
  "Ortopedia y traumatologia": Bone,
  "Otorrinolaringologia": Ear,
  "Pediatria": Baby,
  "Psiquiatria": Brain,
  "Radioterapia": Radiation,
  "Reumatologia": Bone,
  "Terapia intensiva": Ambulance,
  "Toxicologia": FlaskConical,
  "Urologia": Activity,
};

function getIcon(nombre: string): LucideIcon {
  // Normalize for lookup (remove accents)
  const normalized = nombre.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return ICON_MAP[normalized] ?? Building2;
}

const ESPECIALIDADES: Especialidad[] = [
  "Cl\u00ednica m\u00e9dica",
  "Alergia e inmunolog\u00eda",
  "Anatom\u00eda patol\u00f3gica",
  "Anestesiolog\u00eda",
  "Cardiolog\u00eda",
  "Cirug\u00eda cardiovascular",
  "Cirug\u00eda general",
  "Cirug\u00eda pedi\u00e1trica",
  "Cirug\u00eda pl\u00e1stica y reparadora",
  "Cirug\u00eda tor\u00e1cica",
  "Coloproctolog\u00eda",
  "Dermatolog\u00eda",
  "Diagn\u00f3stico por im\u00e1genes",
  "Endocrinolog\u00eda",
  "Farmacolog\u00eda cl\u00ednica",
  "Fisiatr\u00eda",
  "Gastroenterolog\u00eda",
  "Gen\u00e9tica m\u00e9dica",
  "Geriatr\u00eda",
  "Ginecolog\u00eda",
  "Hematolog\u00eda",
  "Hemoterapia e inmunohematolog\u00eda",
  "Hepatolog\u00eda",
  "Infectolog\u00eda",
  "Mastolog\u00eda",
  "Medicina del deporte",
  "Medicina del trabajo",
  "Medicina familiar",
  "Medicina legal",
  "Medicina nuclear",
  "Nefrolog\u00eda",
  "Neonatolog\u00eda",
  "Neumonolog\u00eda",
  "Neurocirug\u00eda",
  "Neurolog\u00eda",
  "Nutrici\u00f3n",
  "Obstetricia",
  "Oftalmolog\u00eda",
  "Oncolog\u00eda",
  "Ortopedia y traumatolog\u00eda",
  "Otorrinolaringolog\u00eda",
  "Patolog\u00eda",
  "Pediatr\u00eda",
  "Psiquiatr\u00eda",
  "Radioterapia",
  "Reumatolog\u00eda",
  "Terapia intensiva",
  "Toxicolog\u00eda",
  "Urolog\u00eda",
].map((nombre) => ({ nombre, icon: getIcon(nombre) }));

function semaforo(estado: Disponibilidad) {
  switch (estado) {
    case "disponible":
      return { color: "var(--color-success)", texto: "Disponible ahora" };
    case "espera":
      return { color: "var(--color-pending)", texto: "Con espera" };
    case "programada":
      return { color: "var(--color-warning)", texto: "Solo programada" };
    case "sin_medicos":
      return { color: "var(--color-muted)", texto: "Sin disponibilidad" };
  }
}

function normalizeTime(t: string): string {
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

  if (especialidad === "Cl\u00ednica m\u00e9dica" && medicosDeLaEsp.length === 0) {
    return "programada";
  }

  if (medicosDeLaEsp.length === 0) return "sin_medicos";

  const disponiblesAhora = medicosDeLaEsp.filter((m) => estaEnHorario(m));
  if (disponiblesAhora.length > 0) return "disponible";

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
  const [emailLead, setEmailLead] = useState("");
  const [leadEnviado, setLeadEnviado] = useState(false);
  const router = useRouter();
  const [modalEspecialidad, setModalEspecialidad] = useState<string | null>(null);
  const [modalModo, setModalModo] = useState<"inmediata" | "turno">("inmediata");

  const termino = normalize(busqueda.trim());

  const espConMedicos = new Set(medicos.map((m) => m.especialidad));

  // Solo especialidades que tienen al menos un médico
  const especialidadesConMedicos = ESPECIALIDADES.filter((e) => espConMedicos.has(e.nombre));

  const espConMatch = new Set<string>();
  const espPorMedico = new Set<string>();
  // Para captura de lead: detectar si buscó una especialidad sin médicos
  let especialidadBuscadaSinMedicos: string | null = null;

  if (termino) {
    for (const esp of ESPECIALIDADES) {
      if (normalize(esp.nombre).includes(termino)) {
        if (espConMedicos.has(esp.nombre)) {
          espConMatch.add(esp.nombre);
        } else {
          especialidadBuscadaSinMedicos = esp.nombre;
        }
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
      ? especialidadesConMedicos
      : especialidadesConMedicos.filter(
          (esp) => espConMatch.has(esp.nombre) || espPorMedico.has(esp.nombre)
        );

  // Orden: Clínica médica siempre primera, el resto alfabético
  const espVisibles = [...especialidadesFiltradas].sort((a, b) => {
    if (a.nombre === "Clínica médica") return -1;
    if (b.nombre === "Clínica médica") return 1;
    return a.nombre.localeCompare(b.nombre, "es");
  });

  // Mostrar captura de lead si busca especialidad sin médicos y no hay resultados con médicos
  const mostrarLeadCapture = termino && especialidadBuscadaSinMedicos && espVisibles.length === 0;

  const esperasPorMedico = new Map<string, number>();
  for (const c of consultasEspera) {
    esperasPorMedico.set(
      c.medico_id,
      (esperasPorMedico.get(c.medico_id) ?? 0) + 1
    );
  }

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
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">
          <Search size={16} strokeWidth={1.75} style={{ color: "var(--color-text-tertiary)" }} />
        </span>
        <input
          type="text"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por especialidad o nombre de médico..."
          className="w-full rounded-[var(--radius-lg)] bg-white py-3 pl-10 pr-4 text-sm shadow-sm placeholder:text-[var(--color-text-tertiary)] focus:outline-none"
          style={{
            border: "1px solid var(--color-border-strong)",
            color: "var(--color-text-primary)",
          }}
          onFocus={(e) => { e.currentTarget.style.borderColor = "var(--color-primary)"; e.currentTarget.style.boxShadow = "var(--shadow-focus)"; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = "var(--color-border-strong)"; e.currentTarget.style.boxShadow = "none"; }}
        />
      </div>

      {/* Leyenda del semaforo */}
      <div className="mb-6 flex flex-wrap gap-4 text-sm" style={{ color: "var(--color-text-secondary)" }}>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: "var(--color-success)" }} />
          Disponible ahora
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: "var(--color-pending)" }} />
          Con espera
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: "var(--color-warning)" }} />
          Solo programada
        </span>
      </div>

      {/* Resultado vacío / Captura de lead */}
      {espVisibles.length === 0 && termino && (
        mostrarLeadCapture ? (
          <div className="rounded-[var(--radius-lg)] bg-white p-6 text-center" style={{ border: "1px solid var(--color-border-default)", boxShadow: "var(--shadow-xs)" }}>
            <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
              No hay médicos disponibles en <span className="font-semibold">{especialidadBuscadaSinMedicos}</span> por ahora.
            </p>
            <p className="mt-1 text-sm" style={{ color: "var(--color-text-tertiary)" }}>
              Dejanos tu email y te avisamos cuando haya uno.
            </p>
            {leadEnviado ? (
              <p className="mt-4 text-sm font-medium" style={{ color: "var(--color-success)" }}>
                ¡Listo! Te avisaremos cuando haya disponibilidad.
              </p>
            ) : (
              <div className="mx-auto mt-4 flex max-w-sm gap-2">
                <input
                  type="email"
                  value={emailLead}
                  onChange={(e) => setEmailLead(e.target.value)}
                  placeholder="tu@email.com"
                  className="flex-1 rounded-[var(--radius-md)] px-3 py-2 text-sm focus:outline-none"
                  style={{ border: "1px solid var(--color-border-strong)", color: "var(--color-text-primary)" }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = "#6B8DE3"; e.currentTarget.style.boxShadow = "0 0 0 1px #6B8DE3"; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = "var(--color-border-strong)"; e.currentTarget.style.boxShadow = "none"; }}
                />
                <button
                  onClick={() => {
                    if (emailLead.trim()) {
                      console.log(`[Lead] Especialidad: ${especialidadBuscadaSinMedicos}, Email: ${emailLead.trim()}`);
                      setLeadEnviado(true);
                    }
                  }}
                  className="rounded-[var(--radius-md)] px-4 py-2 text-sm font-medium text-white active:scale-[0.97] transition-all duration-100"
                  style={{ backgroundColor: "#6B8DE3" }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "#4A63A8"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "#6B8DE3"; }}
                >
                  Avisarme
                </button>
              </div>
            )}
          </div>
        ) : (
          <p className="py-12 text-center text-sm" style={{ color: "var(--color-text-secondary)" }}>
            No se encontraron especialidades para &quot;{busqueda}&quot;
          </p>
        )
      )}

      {/* Grilla */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {espVisibles.map((esp) => {
          const estado = calcularDisponibilidad(esp.nombre, medicos);
          const { color, texto } = semaforo(estado);
          const esSinMedicos = estado === "sin_medicos";

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

          const IconComponent = esp.icon;

          return (
            <div
              key={esp.nombre}
              className={`rounded-[var(--radius-lg)] bg-white transition ${
                esSinMedicos
                  ? "opacity-60 px-5 pt-5 pb-3"
                  : "hover:shadow-[var(--shadow-xs)] p-5"
              }`}
              style={{ border: "1px solid var(--color-border-default)" }}
            >
              <div className="flex items-start justify-between">
                <IconComponent
                  size={24}
                  strokeWidth={1.75}
                  style={{ color: esSinMedicos ? "var(--color-muted)" : "var(--color-brand)" }}
                />
                <span className="flex items-center gap-1.5 text-xs" style={{ color: "var(--color-text-secondary)" }}>
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                  {texto}
                </span>
              </div>

              <h3
                className="mt-3 text-sm font-semibold"
                style={{ color: esSinMedicos ? "var(--color-text-tertiary)" : "var(--color-text-primary)" }}
              >
                {esp.nombre}
              </h3>

              {(() => {
                const medicosEsp = medicos.filter((m) => m.especialidad === esp.nombre);
                if (medicosEsp.length === 0) return null;
                const minPrecio = Math.min(...medicosEsp.map((m) => m.precio_consulta));
                const minDuracion = medicosEsp.find((m) => m.precio_consulta === minPrecio)?.duracion_consulta;
                return (
                  <p className="mt-1 text-xs font-medium" style={{ color: "var(--color-text-primary)" }}>
                    {formatPrecio(minPrecio)}
                    {minDuracion && (
                      <span className="ml-1 font-normal" style={{ color: "var(--color-text-tertiary)" }}>
                        - {minDuracion} min
                      </span>
                    )}
                  </p>
                );
              })()}

              {medicosMatch.length > 0 && (
                <p className="mt-1 text-xs" style={{ color: "var(--color-text-link)" }}>
                  {medicosMatch.map((m) => m.nombre_completo).join(", ")}
                </p>
              )}

              {esSinMedicos ? (
                <p className="mt-4 text-xs" style={{ color: "var(--color-text-tertiary)" }}>Sin disponibilidad</p>
              ) : (
                <div className="mt-4 flex gap-2">
                  <button
                    disabled={botonConsultaDeshabilitado}
                    onClick={() => { setModalModo("inmediata"); setModalEspecialidad(esp.nombre); }}
                    className="flex-1 rounded-[var(--radius-md)] px-3 py-2 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-40 active:scale-[0.97] transition-all duration-100"
                    style={{ backgroundColor: botonConsultaDeshabilitado ? "var(--color-muted)" : "#6B8DE3" }}
                    onMouseEnter={(e) => { if (!botonConsultaDeshabilitado) e.currentTarget.style.backgroundColor = "#4A63A8"; }}
                    onMouseLeave={(e) => { if (!botonConsultaDeshabilitado) e.currentTarget.style.backgroundColor = "#6B8DE3"; }}
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
                    className="flex-1 rounded-[var(--radius-md)] px-3 py-2 text-xs font-medium transition-colors hover:bg-[var(--color-bg-tertiary)]"
                    style={{
                      border: "1px solid var(--color-border-strong)",
                      color: "var(--color-text-secondary)",
                    }}
                  >
                    Agendar turno
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Modal: Médicos disponibles */}
      {modalEspecialidad && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ backgroundColor: "var(--color-overlay)" }}>
          <div className="w-full max-w-lg rounded-[var(--radius-xl)] bg-white p-6" style={{ boxShadow: "var(--shadow-lg)" }}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold" style={{ color: "var(--color-text-primary)" }}>
                {modalModo === "turno" ? "Agendar turno" : "Médicos disponibles"} — {modalEspecialidad}
              </h2>
              <button
                onClick={() => setModalEspecialidad(null)}
                className="flex h-11 w-11 items-center justify-center rounded-[var(--radius-md)] transition-colors hover:bg-[var(--color-bg-tertiary)]"
              >
                <X size={20} strokeWidth={1.75} style={{ color: "var(--color-text-tertiary)" }} />
              </button>
            </div>

            {medicosDelModal.length === 0 ? (
              <p className="mt-6 text-center text-sm" style={{ color: "var(--color-text-secondary)" }}>
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
                      className={`flex items-center justify-between rounded-[var(--radius-lg)] p-4 ${
                        disponibleAhora ? "" : "opacity-60"
                      }`}
                      style={{ border: `1px solid var(--color-border-default)` }}
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium" style={{ color: "var(--color-text-primary)" }}>
                            {m.nombre_completo}
                          </p>
                          <span
                            className="inline-block h-2 w-2 rounded-full"
                            style={{ backgroundColor: disponibleAhora ? "var(--color-success)" : "var(--color-border-default)" }}
                          />
                        </div>
                        <p className="mt-0.5 text-sm" style={{ color: "var(--color-text-secondary)" }}>
                          {formatPrecio(m.precio_consulta)} - {m.duracion_consulta} min
                        </p>
                        <p className="mt-0.5 text-xs" style={{ color: "var(--color-text-tertiary)" }}>
                          {!disponibleAhora ? (
                            <span>No disponible ahora</span>
                          ) : enEspera === 0 ? (
                            <span className="font-medium" style={{ color: "var(--color-success)" }}>
                              Sin espera
                            </span>
                          ) : (
                            <>
                              {enEspera} paciente{enEspera !== 1 ? "s" : ""} en
                              espera - ~{tiempoEstimado} min
                            </>
                          )}
                        </p>
                      </div>
                      {modalModo === "turno" ? (
                        <a
                          href={`/clinica/${m.id}/turnos`}
                          className="shrink-0 rounded-[var(--radius-md)] px-4 py-2 text-sm font-medium text-white"
                          style={{ backgroundColor: "var(--color-success)" }}
                        >
                          Ver turnos
                        </a>
                      ) : (
                        <div className="flex shrink-0 flex-col gap-1.5">
                          <button
                            disabled={!disponibleAhora}
                            onClick={() => handleElegirMedico(m.id, modalEspecialidad!)}
                            className="rounded-[var(--radius-md)] px-3 py-1.5 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-40 active:scale-[0.97] transition-all duration-100"
                            style={{ backgroundColor: disponibleAhora ? "#6B8DE3" : "var(--color-muted)" }}
                            onMouseEnter={(e) => { if (disponibleAhora) e.currentTarget.style.backgroundColor = "#4A63A8"; }}
                            onMouseLeave={(e) => { if (disponibleAhora) e.currentTarget.style.backgroundColor = "#6B8DE3"; }}
                          >
                            Consulta ahora
                          </button>
                          <a
                            href={`/clinica/${m.id}/turnos`}
                            className="rounded-[var(--radius-md)] px-3 py-1.5 text-center text-xs font-medium transition-colors hover:bg-[var(--color-bg-tertiary)]"
                            style={{ backgroundColor: "var(--color-bg-tertiary)", color: "var(--color-text-secondary)" }}
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
              className="mt-4 w-full rounded-[var(--radius-md)] px-4 py-2 text-sm font-medium transition-colors hover:bg-[var(--color-bg-tertiary)]"
              style={{
                border: "1px solid var(--color-border-strong)",
                color: "var(--color-text-secondary)",
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </>
  );
}
