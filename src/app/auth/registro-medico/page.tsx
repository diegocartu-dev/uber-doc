"use client";

import Link from "next/link";
import { useState } from "react";
import { registrarMedico } from "./actions";

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

export default function RegistroMedicoPage() {
  const [tipoMatricula, setTipoMatricula] = useState("MN");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkTerminos, setCheckTerminos] = useState(false);
  const [checkMatricula, setCheckMatricula] = useState(false);
  const [modalTerminos, setModalTerminos] = useState(false);
  const [modalMatricula, setModalMatricula] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
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
    "mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";
  const labelClass = "block text-sm font-medium text-gray-700";

  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-8 flex items-center justify-center gap-2">
          <span className="text-3xl">🩺</span>
          <span className="text-2xl font-bold text-gray-900">Uber Doc</span>
        </Link>

        <h2 className="text-center text-xl font-semibold text-gray-900">
          Registro de médico
        </h2>
        <p className="mt-1 text-center text-sm text-gray-500">
          Completá tus datos para comenzar a atender pacientes
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
              {error}
            </div>
          )}

          {/* Nombre completo */}
          <div>
            <label htmlFor="nombre_completo" className={labelClass}>
              Nombre completo
            </label>
            <input
              id="nombre_completo"
              name="nombre_completo"
              type="text"
              required
              className={inputClass}
              placeholder="Dr. Juan Pérez"
            />
          </div>

          {/* Email */}
          <div>
            <label htmlFor="email" className={labelClass}>
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              className={inputClass}
              placeholder="doctor@email.com"
            />
          </div>

          {/* Contraseña */}
          <div>
            <label htmlFor="password" className={labelClass}>
              Contraseña
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              minLength={6}
              className={inputClass}
              placeholder="Mínimo 6 caracteres"
            />
          </div>

          {/* Especialidad */}
          <div>
            <label htmlFor="especialidad" className={labelClass}>
              Especialidad
            </label>
            <select
              id="especialidad"
              name="especialidad"
              required
              className={inputClass}
              defaultValue=""
            >
              <option value="" disabled>
                Seleccioná tu especialidad
              </option>
              {ESPECIALIDADES.map((esp) => (
                <option key={esp} value={esp}>
                  {esp}
                </option>
              ))}
            </select>
          </div>

          {/* Tipo de matrícula */}
          <div>
            <label htmlFor="tipo_matricula" className={labelClass}>
              Tipo de matrícula
            </label>
            <select
              id="tipo_matricula"
              name="tipo_matricula"
              required
              className={inputClass}
              value={tipoMatricula}
              onChange={(e) => setTipoMatricula(e.target.value)}
            >
              <option value="MN">MN - Matrícula Nacional</option>
              <option value="MP">MP - Matrícula Provincial</option>
            </select>
          </div>

          {/* Número de matrícula */}
          <div>
            <label htmlFor="numero_matricula" className={labelClass}>
              Número de matrícula
            </label>
            <input
              id="numero_matricula"
              name="numero_matricula"
              type="text"
              required
              className={inputClass}
              placeholder="Ej: 123456"
            />
          </div>

          {/* Provincia (solo si es MP) */}
          {tipoMatricula === "MP" && (
            <div>
              <label htmlFor="provincia" className={labelClass}>
                Provincia
              </label>
              <select
                id="provincia"
                name="provincia"
                required
                className={inputClass}
                defaultValue=""
              >
                <option value="" disabled>
                  Seleccioná tu provincia
                </option>
                {PROVINCIAS.map((prov) => (
                  <option key={prov} value={prov}>
                    {prov}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* CUIT */}
          <div>
            <label htmlFor="cuit" className={labelClass}>
              CUIT
            </label>
            <input
              id="cuit"
              name="cuit"
              type="text"
              required
              className={inputClass}
              placeholder="20-12345678-9"
            />
          </div>

          {/* Matrícula provincial */}
          <div>
            <label htmlFor="matricula_provincial" className={labelClass}>
              Matrícula provincial <span className="text-gray-400">(opcional)</span>
            </label>
            <input
              id="matricula_provincial"
              name="matricula_provincial"
              type="text"
              className={inputClass}
              placeholder="MP 45678"
            />
          </div>

          {/* Provincia de la matrícula */}
          <div>
            <label htmlFor="provincia_matricula" className={labelClass}>
              Provincia de la matrícula <span className="text-gray-400">(opcional)</span>
            </label>
            <input
              id="provincia_matricula"
              name="provincia_matricula"
              type="text"
              className={inputClass}
              placeholder="Buenos Aires"
            />
          </div>

          {/* Precio de consulta */}
          <div>
            <label htmlFor="precio_consulta" className={labelClass}>
              Precio de consulta (ARS)
            </label>
            <div className="relative mt-1">
              <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-gray-500">
                $
              </span>
              <input
                id="precio_consulta"
                name="precio_consulta"
                type="number"
                required
                min={1}
                className={inputClass + " pl-7"}
                placeholder="15000"
              />
            </div>
          </div>

          {/* Duración de consulta */}
          <div>
            <label htmlFor="duracion_consulta" className={labelClass}>
              Duración de consulta
            </label>
            <select
              id="duracion_consulta"
              name="duracion_consulta"
              required
              className={inputClass}
              defaultValue=""
            >
              <option value="" disabled>
                Seleccioná la duración
              </option>
              <option value="20">20 minutos</option>
              <option value="30">30 minutos</option>
              <option value="45">45 minutos</option>
            </select>
          </div>

          {/* Modalidad de atención */}
          <div>
            <label htmlFor="modalidad_atencion" className={labelClass}>
              Modalidad de atención
            </label>
            <select
              id="modalidad_atencion"
              name="modalidad_atencion"
              required
              className={inputClass}
              defaultValue=""
            >
              <option value="" disabled>
                Seleccioná la modalidad
              </option>
              <option value="programada">Programada</option>
              <option value="inmediata">Inmediata</option>
              <option value="ambas">Ambas</option>
            </select>
          </div>

          {/* Términos y condiciones */}
          <div className="space-y-3">
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={checkTerminos}
                onChange={(e) => setCheckTerminos(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">
                Leí y acepto los{" "}
                <button
                  type="button"
                  onClick={() => setModalTerminos(true)}
                  className="font-medium text-blue-600 hover:text-blue-500 underline"
                >
                  términos y condiciones
                </button>{" "}
                de Uber Doc
              </span>
            </label>

            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={checkMatricula}
                onChange={(e) => setCheckMatricula(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">
                Declaro que la información de mi matrícula profesional es
                verídica y que soy responsable de mis actos médicos como{" "}
                <button
                  type="button"
                  onClick={() => setModalMatricula(true)}
                  className="font-medium text-blue-600 hover:text-blue-500 underline"
                >
                  profesional independiente
                </button>
              </span>
            </label>
          </div>

          <button
            type="submit"
            disabled={loading || !checkTerminos || !checkMatricula}
            className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "Registrando..." : "Registrarme como médico"}
          </button>
        </form>

        {/* Modal términos */}
        {modalTerminos && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
            <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">
                  Términos y condiciones
                </h2>
                <button
                  onClick={() => setModalTerminos(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>
              <div className="mt-4 h-72 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm leading-relaxed text-gray-700">
                <h3 className="font-semibold">1. Aceptación de términos de uso</h3>
                <p className="mt-1">Al registrarse como profesional médico en Uber Doc, usted acepta estos términos en su totalidad. La plataforma actúa como intermediaria tecnológica entre profesionales de la salud y pacientes.</p>

                <h3 className="mt-3 font-semibold">2. Protección de datos médicos (Ley 25.326)</h3>
                <p className="mt-1">Los datos de los pacientes atendidos a través de la plataforma son tratados conforme a la Ley 25.326 de Protección de Datos Personales. Usted se compromete a mantener la confidencialidad de la información médica y a no compartirla con terceros no autorizados.</p>

                <h3 className="mt-3 font-semibold">3. Ejercicio de la telemedicina</h3>
                <p className="mt-1">Las consultas se realizan conforme a las normativas vigentes de telemedicina en Argentina. El profesional es responsable de evaluar si la teleconsulta es apropiada para cada caso y derivar a atención presencial cuando lo considere necesario, conforme a la Ley 26.529 de Derechos del Paciente.</p>

                <h3 className="mt-3 font-semibold">4. Responsabilidad de Uber Doc</h3>
                <p className="mt-1">Uber Doc actúa exclusivamente como plataforma tecnológica intermediaria. No ejerce dirección, supervisión ni control sobre el criterio médico de los profesionales. Cada médico es responsable de sus actos profesionales conforme a la Ley 17.132.</p>

                <h3 className="mt-3 font-semibold">5. Política de privacidad</h3>
                <p className="mt-1">Los datos profesionales proporcionados se utilizan para la prestación del servicio y la verificación de credenciales. La información de consultas se almacena de forma segura y encriptada.</p>
              </div>
              <button
                onClick={() => setModalTerminos(false)}
                className="mt-4 w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Cerrar
              </button>
            </div>
          </div>
        )}

        {/* Modal declaración de matrícula */}
        {modalMatricula && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
            <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">
                  Declaración de responsabilidad profesional
                </h2>
                <button
                  onClick={() => setModalMatricula(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>
              <div className="mt-4 h-72 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm leading-relaxed text-gray-700">
                <h3 className="font-semibold">Declaración jurada de responsabilidad profesional</h3>
                <p className="mt-2">Al aceptar esta declaración, el profesional médico certifica que:</p>

                <p className="mt-2"><strong>1.</strong> La información de matrícula profesional proporcionada es verídica, se encuentra vigente y corresponde a su persona. Cualquier falsedad constituye un delito penal conforme al artículo 292 del Código Penal Argentino.</p>

                <p className="mt-2"><strong>2.</strong> Actúa como profesional independiente conforme a la Ley 17.132 de Ejercicio de la Medicina. Es el único responsable de sus actos profesionales, diagnósticos, indicaciones y prescripciones realizadas a través de la plataforma.</p>

                <p className="mt-2"><strong>3.</strong> Se compromete a ejercer la telemedicina dentro de los límites de su especialidad y competencia, derivando a atención presencial cuando la situación clínica lo requiera.</p>

                <p className="mt-2"><strong>4.</strong> Uber Doc no interviene en las decisiones médicas del profesional ni asume responsabilidad por las mismas. La plataforma actúa exclusivamente como intermediaria tecnológica.</p>

                <p className="mt-2"><strong>5.</strong> Se compromete a mantener actualizada su información profesional y a informar inmediatamente cualquier cambio en el estado de su matrícula.</p>
              </div>
              <button
                onClick={() => setModalMatricula(false)}
                className="mt-4 w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Cerrar
              </button>
            </div>
          </div>
        )}

        <p className="mt-6 text-center text-sm text-gray-600">
          ¿Ya tenés cuenta?{" "}
          <Link
            href="/auth/login"
            className="font-medium text-blue-600 hover:text-blue-500"
          >
            Iniciá sesión
          </Link>
        </p>
      </div>
    </div>
  );
}
