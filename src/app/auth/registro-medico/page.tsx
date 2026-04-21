"use client";

import Link from "next/link";
import { useState, useRef } from "react";
import { Stethoscope, X, Upload, CheckCircle, ChevronLeft } from "lucide-react";
import { registrarMedico } from "./actions";
import LoadingButton from "@/components/ui/LoadingButton";

const ESPECIALIDADES = [
  "Alergia e inmunología",
  "Anatomía patológica",
  "Anestesiología",
  "Cardiología",
  "Cirugía cardiovascular",
  "Cirugía general",
  "Cirugía pediátrica",
  "Cirugía plástica y reparadora",
  "Cirugía torácica",
  "Clínica médica",
  "Coloproctología",
  "Dermatología",
  "Diagnóstico por imágenes",
  "Endocrinología",
  "Farmacología clínica",
  "Fisiatría",
  "Gastroenterología",
  "Genética médica",
  "Geriatría",
  "Ginecología",
  "Hematología",
  "Hemoterapia e inmunohematología",
  "Hepatología",
  "Infectología",
  "Mastología",
  "Medicina del deporte",
  "Medicina del trabajo",
  "Medicina familiar",
  "Medicina legal",
  "Medicina nuclear",
  "Nefrología",
  "Neonatología",
  "Neumonología",
  "Neurocirugía",
  "Neurología",
  "Nutrición",
  "Obstetricia",
  "Oftalmología",
  "Oncología",
  "Ortopedia y traumatología",
  "Otorrinolaringología",
  "Patología",
  "Pediatría",
  "Psiquiatría",
  "Radioterapia",
  "Reumatología",
  "Terapia intensiva",
  "Toxicología",
  "Urología",
];

const PROVINCIAS = [
  "Buenos Aires",
  "CABA",
  "Catamarca",
  "Chaco",
  "Chubut",
  "Córdoba",
  "Corrientes",
  "Entre Ríos",
  "Formosa",
  "Jujuy",
  "La Pampa",
  "La Rioja",
  "Mendoza",
  "Misiones",
  "Neuquén",
  "Río Negro",
  "Salta",
  "San Juan",
  "San Luis",
  "Santa Cruz",
  "Santa Fe",
  "Santiago del Estero",
  "Tierra del Fuego",
  "Tucumán",
];

const MAX_FILE_SIZE = 5 * 1024 * 1024;

export default function RegistroMedicoPage() {
  const [paso, setPaso] = useState(1);
  const [tipoMatricula, setTipoMatricula] = useState("MN");
  const [tieneMatriculaExtra, setTieneMatriculaExtra] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkTerminos, setCheckTerminos] = useState(false);
  const [checkMatricula, setCheckMatricula] = useState(false);
  const [modalTerminos, setModalTerminos] = useState(false);
  const [modalMatricula, setModalMatricula] = useState(false);
  const [fotoCredencial, setFotoCredencial] = useState<File | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  function validarPaso1(): boolean {
    const form = formRef.current;
    if (!form) return false;
    const fields = ["titulo", "nombre_completo", "email", "password", "dni"];
    for (const name of fields) {
      const el = form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement;
      if (!el || !el.value.trim()) {
        setError(`Completá el campo "${el?.labels?.[0]?.textContent || name}".`);
        el?.focus();
        return false;
      }
    }
    const pwd = (form.elements.namedItem("password") as HTMLInputElement).value;
    if (pwd.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return false;
    }
    const dni = (form.elements.namedItem("dni") as HTMLInputElement).value;
    if (!/^\d{7,8}$/.test(dni)) {
      setError("El DNI debe tener 7 u 8 dígitos numéricos.");
      return false;
    }
    return true;
  }

  function validarPaso2(): boolean {
    const form = formRef.current;
    if (!form) return false;
    const numero = (form.elements.namedItem("numero_matricula") as HTMLInputElement)?.value;
    if (!numero?.trim()) {
      setError("Ingresá tu número de matrícula.");
      return false;
    }
    if (tipoMatricula === "MP") {
      const prov = (form.elements.namedItem("provincia") as HTMLSelectElement)?.value;
      if (!prov) {
        setError("Seleccioná la provincia de tu matrícula.");
        return false;
      }
    }
    const cuit = (form.elements.namedItem("cuit") as HTMLInputElement)?.value;
    if (!cuit?.trim()) {
      setError("Ingresá tu CUIT.");
      return false;
    }
    const esp = (form.elements.namedItem("especialidad") as HTMLSelectElement)?.value;
    if (!esp) {
      setError("Seleccioná tu especialidad.");
      return false;
    }
    const domicilio = (form.elements.namedItem("domicilio") as HTMLInputElement)?.value;
    if (!domicilio?.trim()) {
      setError("Ingresá tu domicilio profesional.");
      return false;
    }
    return true;
  }

  function siguiente() {
    setError(null);
    if (paso === 1 && validarPaso1()) setPaso(2);
    else if (paso === 2 && validarPaso2()) setPaso(3);
  }

  function anterior() {
    setError(null);
    setPaso((p) => Math.max(1, p - 1));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (paso < 3) { siguiente(); return; }
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const result = await registrarMedico(formData);

    if (result?.error) {
      setError(result.error);
      setLoading(false);
    }
  }

  const inputClass =
    "mt-1 block w-full h-11 rounded-[var(--radius-md)] border px-3 text-[15px] shadow-sm focus:outline-none";
  const labelClass = "block text-[13px] font-medium";
  const pasoTitulos = ["Tu cuenta", "Tu matrícula", "Tu consulta"];

  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-6 flex items-center justify-center gap-2">
          <Stethoscope size={28} strokeWidth={2} color="var(--color-brand)" />
          <span className="text-2xl font-bold" style={{ color: "var(--color-text-primary)" }}>docto</span>
        </Link>

        {/* Progress indicator */}
        <div className="mb-6 flex items-center justify-center gap-2">
          {[1, 2, 3].map((n) => (
            <div key={n} className="flex items-center gap-2">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                  n === paso
                    ? "bg-[#378ADD] text-white"
                    : n < paso
                      ? "bg-[#378ADD]/20 text-[#378ADD]"
                      : "bg-gray-100 text-gray-400"
                }`}
              >
                {n < paso ? "\u2713" : n}
              </div>
              {n < 3 && (
                <div className={`h-0.5 w-6 rounded transition-colors ${n < paso ? "bg-[#378ADD]/40" : "bg-gray-200"}`} />
              )}
            </div>
          ))}
        </div>

        <h2 className="text-center text-xl font-semibold text-gray-900">
          {pasoTitulos[paso - 1]}
        </h2>
        <p className="mt-1 text-center text-sm text-gray-500">
          Paso {paso} de 3
        </p>

        <form ref={formRef} onSubmit={handleSubmit} className="mt-6 space-y-4">
          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
              {error}
            </div>
          )}

          {/* ═══ PASO 1: Tu cuenta ═══ */}
          <div className={paso === 1 ? "space-y-4" : "hidden"}>
            <div>
              <label htmlFor="titulo" className={labelClass}>Título profesional</label>
              <select id="titulo" name="titulo" required className={inputClass} defaultValue="">
                <option value="" disabled>Seleccioná tu título</option>
                <option value="Dr.">Dr.</option>
                <option value="Dra.">Dra.</option>
              </select>
            </div>

            <div>
              <label htmlFor="nombre_completo" className={labelClass}>Nombre completo</label>
              <input id="nombre_completo" name="nombre_completo" type="text" required className={inputClass} placeholder="Juan Pérez" />
            </div>

            <div>
              <label htmlFor="email" className={labelClass}>Email</label>
              <input id="email" name="email" type="email" required className={inputClass} placeholder="doctor@email.com" />
            </div>

            <div>
              <label htmlFor="password" className={labelClass}>Contraseña</label>
              <input id="password" name="password" type="password" required minLength={8} className={inputClass} placeholder="Mínimo 8 caracteres" />
            </div>

            <div>
              <label htmlFor="dni" className={labelClass}>DNI</label>
              <input id="dni" name="dni" type="text" required inputMode="numeric" pattern="\d{7,8}" maxLength={8} className={inputClass} placeholder="12345678" />
              <p className="mt-1 text-xs text-gray-400">7 u 8 dígitos, sin puntos</p>
            </div>
          </div>

          {/* ═══ PASO 2: Tu matrícula ═══ */}
          <div className={paso === 2 ? "space-y-4" : "hidden"}>
            <div>
              <label htmlFor="tipo_matricula" className={labelClass}>Tipo de matrícula</label>
              <select
                id="tipo_matricula"
                name="tipo_matricula"
                required
                className={inputClass}
                value={tipoMatricula}
                onChange={(e) => {
                  setTipoMatricula(e.target.value);
                  if (e.target.value === "MP") setTieneMatriculaExtra(false);
                }}
              >
                <option value="MN">MN - Matrícula Nacional</option>
                <option value="MP">MP - Matrícula Provincial</option>
              </select>
            </div>

            <div>
              <label htmlFor="numero_matricula" className={labelClass}>Número de matrícula</label>
              <input id="numero_matricula" name="numero_matricula" type="text" required className={inputClass} placeholder="Ej: 123456" />
            </div>

            {tipoMatricula === "MP" && (
              <div>
                <label htmlFor="provincia" className={labelClass}>Provincia</label>
                <select id="provincia" name="provincia" required className={inputClass} defaultValue="">
                  <option value="" disabled>Seleccioná tu provincia</option>
                  {PROVINCIAS.map((prov) => (
                    <option key={prov} value={prov}>{prov}</option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label htmlFor="especialidad" className={labelClass}>Especialidad</label>
              <select id="especialidad" name="especialidad" required className={inputClass} defaultValue="">
                <option value="" disabled>Seleccioná tu especialidad</option>
                {ESPECIALIDADES.map((esp) => (
                  <option key={esp} value={esp}>{esp}</option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="cuit" className={labelClass}>CUIT</label>
              <input id="cuit" name="cuit" type="text" required className={inputClass} placeholder="20-12345678-9" />
            </div>

            <div>
              <label htmlFor="domicilio" className={labelClass}>Domicilio profesional</label>
              <input id="domicilio" name="domicilio" type="text" required className={inputClass} placeholder="Calle, número, ciudad" />
              <p className="mt-1 text-xs text-gray-400">Requerido por Ley 17.132 para recetas</p>
            </div>

            {/* Matrícula adicional — solo si MN y el médico tiene otra provincial */}
            {tipoMatricula === "MN" && (
              <div>
                <label className="flex items-center gap-2 text-sm text-gray-600">
                  <input
                    type="checkbox"
                    checked={tieneMatriculaExtra}
                    onChange={(e) => setTieneMatriculaExtra(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  También tengo matrícula provincial
                </label>
                {tieneMatriculaExtra && (
                  <div className="mt-3 space-y-3 rounded-lg bg-gray-50 p-3">
                    <div>
                      <label htmlFor="matricula_provincial" className={labelClass}>
                        Número de matrícula provincial
                      </label>
                      <input id="matricula_provincial" name="matricula_provincial" type="text" className={inputClass} placeholder="MP 45678" />
                    </div>
                    <div>
                      <label htmlFor="provincia_matricula" className={labelClass}>Provincia</label>
                      <select id="provincia_matricula" name="provincia_matricula" className={inputClass} defaultValue="">
                        <option value="">Seleccioná</option>
                        {PROVINCIAS.map((prov) => (
                          <option key={prov} value={prov}>{prov}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div>
              <label htmlFor="foto_credencial" className={labelClass}>Foto de credencial de matrícula</label>
              <div className="mt-1">
                <label
                  htmlFor="foto_credencial"
                  className="flex cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-md)] border border-dashed border-gray-300 px-4 py-4 text-sm text-gray-500 transition hover:border-gray-400 hover:bg-gray-50"
                >
                  {fotoCredencial ? (
                    <>
                      <CheckCircle size={18} className="text-[#1D9E75]" />
                      <span className="text-gray-700">{fotoCredencial.name}</span>
                    </>
                  ) : (
                    <>
                      <Upload size={18} />
                      <span>Subir imagen o PDF de tu credencial</span>
                    </>
                  )}
                </label>
                <input
                  id="foto_credencial"
                  name="foto_credencial"
                  type="file"
                  accept="image/*,.pdf"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    if (file && file.size > MAX_FILE_SIZE) {
                      setError("El archivo no puede superar 5 MB.");
                      e.target.value = "";
                      return;
                    }
                    setError(null);
                    setFotoCredencial(file);
                  }}
                />
                <p className="mt-1 text-xs text-gray-400">JPG, PNG o PDF. Máximo 5 MB.</p>
              </div>
            </div>
          </div>

          {/* ═══ PASO 3: Tu consulta ═══ */}
          <div className={paso === 3 ? "space-y-4" : "hidden"}>
            <div>
              <label htmlFor="precio_consulta" className={labelClass}>Valor de consulta</label>
              <div className="relative mt-1">
                <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-gray-500">$</span>
                <input id="precio_consulta" name="precio_consulta" type="number" required min={1} className={inputClass + " pl-7"} placeholder="15000" />
              </div>
            </div>

            <div>
              <label htmlFor="duracion_consulta" className={labelClass}>Duración de consulta</label>
              <select id="duracion_consulta" name="duracion_consulta" required className={inputClass} defaultValue="">
                <option value="" disabled>Seleccioná la duración</option>
                <option value="20">20 minutos</option>
                <option value="30">30 minutos</option>
                <option value="45">45 minutos</option>
              </select>
            </div>

            <div>
              <label htmlFor="modalidad_atencion" className={labelClass}>Modalidad de atención</label>
              <select id="modalidad_atencion" name="modalidad_atencion" required className={inputClass} defaultValue="">
                <option value="" disabled>Seleccioná la modalidad</option>
                <option value="programada">Programada</option>
                <option value="inmediata">Inmediata</option>
                <option value="ambas">Ambas</option>
              </select>
            </div>

            {/* Términos y condiciones */}
            <div className="space-y-3 pt-2">
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={checkTerminos}
                  onChange={(e) => setCheckTerminos(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300"
                />
                <span className="text-sm text-gray-700">
                  Leí y acepto los{" "}
                  <button type="button" onClick={() => setModalTerminos(true)} className="font-medium underline">
                    términos y condiciones
                  </button>{" "}
                  de Docto
                </span>
              </label>

              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={checkMatricula}
                  onChange={(e) => setCheckMatricula(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300"
                />
                <span className="text-sm text-gray-700">
                  Declaro que la información de mi matrícula profesional es
                  verídica y que soy responsable de mis actos médicos como{" "}
                  <button type="button" onClick={() => setModalMatricula(true)} className="font-medium underline">
                    profesional independiente
                  </button>
                </span>
              </label>
            </div>
          </div>

          {/* Navegación entre pasos */}
          <div className="flex gap-3 pt-2">
            {paso > 1 && (
              <button
                type="button"
                onClick={anterior}
                className="flex h-11 items-center gap-1 rounded-[var(--radius-md)] border border-gray-200 px-4 text-sm font-medium text-gray-600 transition hover:bg-gray-50 active:scale-[0.97]"
              >
                <ChevronLeft size={16} />
                Atrás
              </button>
            )}

            {paso < 3 ? (
              <button
                type="button"
                onClick={siguiente}
                className="flex-1 h-11 rounded-[var(--radius-md)] bg-[#378ADD] text-sm font-semibold text-white shadow-sm transition hover:bg-[#2d75c4] active:scale-[0.97]"
              >
                Siguiente
              </button>
            ) : (
              <LoadingButton
                type="submit"
                isLoading={loading}
                disabled={!checkTerminos || !checkMatricula}
                className="flex-1 h-11 rounded-[var(--radius-md)] px-4 text-sm font-semibold text-white shadow-sm disabled:opacity-50 active:scale-[0.97] transition-all duration-100"
                style={{ backgroundColor: "#378ADD" }}
              >
                Completar registro
              </LoadingButton>
            )}
          </div>
        </form>

        {/* Modal términos */}
        {modalTerminos && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
            <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">
                  Términos y condiciones
                </h2>
                <button onClick={() => setModalTerminos(false)} className="text-gray-400 hover:text-gray-600">
                  <X size={20} strokeWidth={1.75} />
                </button>
              </div>
              <div className="mt-4 h-72 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm leading-relaxed text-gray-700">
                <h3 className="font-semibold">1. Aceptación de términos de uso</h3>
                <p className="mt-1">Al registrarse como profesional médico en Docto, usted acepta estos términos en su totalidad. La plataforma actúa como intermediaria tecnológica entre profesionales de la salud y pacientes.</p>

                <h3 className="mt-3 font-semibold">2. Protección de datos médicos (Ley 25.326)</h3>
                <p className="mt-1">Los datos de los pacientes atendidos a través de la plataforma son tratados conforme a la Ley 25.326 de Protección de Datos Personales. Usted se compromete a mantener la confidencialidad de la información médica y a no compartirla con terceros no autorizados.</p>

                <h3 className="mt-3 font-semibold">3. Ejercicio de la telemedicina</h3>
                <p className="mt-1">Las consultas se realizan conforme a las normativas vigentes de telemedicina en Argentina. El profesional es responsable de evaluar si la teleconsulta es apropiada para cada caso y derivar a atención presencial cuando lo considere necesario, conforme a la Ley 26.529 de Derechos del Paciente.</p>

                <h3 className="mt-3 font-semibold">4. Responsabilidad de Docto</h3>
                <p className="mt-1">Docto actúa exclusivamente como plataforma tecnológica intermediaria. No ejerce dirección, supervisión ni control sobre el criterio médico de los profesionales. Cada médico es responsable de sus actos profesionales conforme a la Ley 17.132.</p>

                <h3 className="mt-3 font-semibold">5. Política de privacidad</h3>
                <p className="mt-1">Los datos profesionales proporcionados se utilizan para la prestación del servicio y la verificación de credenciales. La información de consultas se almacena de forma segura y encriptada.</p>
              </div>
              <button
                onClick={() => setModalTerminos(false)}
                className="mt-4 w-full rounded-[var(--radius-md)] px-4 py-2 text-sm font-medium text-white active:scale-[0.97] transition-all duration-100"
                style={{ backgroundColor: "#378ADD" }}
              >
                Cerrar
              </button>
            </div>
          </div>
        )}

        {/* Modal declaracion de matricula */}
        {modalMatricula && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
            <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">
                  Declaración de responsabilidad profesional
                </h2>
                <button onClick={() => setModalMatricula(false)} className="text-gray-400 hover:text-gray-600">
                  <X size={20} strokeWidth={1.75} />
                </button>
              </div>
              <div className="mt-4 h-72 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm leading-relaxed text-gray-700">
                <h3 className="font-semibold">Declaración jurada de responsabilidad profesional</h3>
                <p className="mt-2">Al aceptar esta declaración, el profesional médico certifica que:</p>

                <p className="mt-2"><strong>1.</strong> La información de matrícula profesional proporcionada es verídica, se encuentra vigente y corresponde a su persona. Cualquier falsedad constituye un delito penal conforme al artículo 292 del Código Penal Argentino.</p>

                <p className="mt-2"><strong>2.</strong> Actúa como profesional independiente conforme a la Ley 17.132 de Ejercicio de la Medicina. Es el único responsable de sus actos profesionales, diagnósticos, indicaciones y prescripciones realizadas a través de la plataforma.</p>

                <p className="mt-2"><strong>3.</strong> Se compromete a ejercer la telemedicina dentro de los límites de su especialidad y competencia, derivando a atención presencial cuando la situación clínica lo requiera.</p>

                <p className="mt-2"><strong>4.</strong> Docto no interviene en las decisiones médicas del profesional ni asume responsabilidad por las mismas. La plataforma actúa exclusivamente como intermediaria tecnológica.</p>

                <p className="mt-2"><strong>5.</strong> Se compromete a mantener actualizada su información profesional y a informar inmediatamente cualquier cambio en el estado de su matrícula.</p>
              </div>
              <button
                onClick={() => setModalMatricula(false)}
                className="mt-4 w-full rounded-[var(--radius-md)] px-4 py-2 text-sm font-medium text-white active:scale-[0.97] transition-all duration-100"
                style={{ backgroundColor: "#378ADD" }}
              >
                Cerrar
              </button>
            </div>
          </div>
        )}

        <p className="mt-6 text-center text-sm text-gray-600">
          ¿Ya tenés cuenta?{" "}
          <Link href="/auth/login" className="font-medium" style={{ color: "var(--color-text-link)" }}>
            Iniciá sesión
          </Link>
        </p>
      </div>
    </div>
  );
}
