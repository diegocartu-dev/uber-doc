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

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "Registrando..." : "Registrarme como médico"}
          </button>
        </form>

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
