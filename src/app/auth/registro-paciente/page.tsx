"use client";

import Link from "next/link";
import { useState } from "react";
import { registrarPaciente } from "./actions";

export default function RegistroPacientePage() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkTerminos, setCheckTerminos] = useState(false);
  const [modalTerminos, setModalTerminos] = useState(false);
  const [obraSocial, setObraSocial] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const result = await registrarPaciente(formData);

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
          Registro de paciente
        </h2>
        <p className="mt-1 text-center text-sm text-gray-500">
          Creá tu cuenta para acceder a consultas médicas
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
              placeholder="Juan Pérez"
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
              placeholder="tu@email.com"
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

          {/* DNI */}
          <div>
            <label htmlFor="dni" className={labelClass}>
              DNI
            </label>
            <input
              id="dni"
              name="dni"
              type="text"
              required
              inputMode="numeric"
              pattern="[0-9]{7,8}"
              className={inputClass}
              placeholder="12345678"
            />
          </div>

          {/* Fecha de nacimiento */}
          <div>
            <label htmlFor="fecha_nacimiento" className={labelClass}>
              Fecha de nacimiento
            </label>
            <input
              id="fecha_nacimiento"
              name="fecha_nacimiento"
              type="date"
              required
              className={inputClass}
            />
          </div>

          {/* Teléfono */}
          <div>
            <label htmlFor="telefono" className={labelClass}>
              Teléfono
            </label>
            <input
              id="telefono"
              name="telefono"
              type="tel"
              required
              className={inputClass}
              placeholder="11 2345-6789"
            />
          </div>

          {/* Obra social */}
          <div>
            <label htmlFor="obra_social" className={labelClass}>
              Obra social <span className="text-gray-400">(opcional)</span>
            </label>
            <input
              id="obra_social"
              name="obra_social"
              type="text"
              value={obraSocial}
              onChange={(e) => setObraSocial(e.target.value)}
              className={inputClass}
              placeholder="Ej: OSDE, Swiss Medical"
            />
          </div>

          {/* Número de afiliado — solo si tiene obra social */}
          {obraSocial && (
            <div>
              <label htmlFor="nro_afiliado" className={labelClass}>
                Número de afiliado <span className="text-gray-400">(opcional)</span>
              </label>
              <input
                id="nro_afiliado"
                name="nro_afiliado"
                type="text"
                className={inputClass}
                placeholder="Ej: 123456789"
              />
            </div>
          )}

          {/* Términos y condiciones */}
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

          <button
            type="submit"
            disabled={loading || !checkTerminos}
            className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "Registrando..." : "Registrarme como paciente"}
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
                <p className="mt-1">Al registrarse en Uber Doc, el usuario acepta estos términos y condiciones en su totalidad. La plataforma ofrece servicios de telemedicina que conectan pacientes con profesionales médicos matriculados en la República Argentina.</p>

                <h3 className="mt-3 font-semibold">2. Protección de datos personales (Ley 25.326)</h3>
                <p className="mt-1">Sus datos personales y de salud son tratados conforme a la Ley 25.326 de Protección de Datos Personales. La información médica es confidencial y solo será compartida con el profesional tratante. Usted tiene derecho a acceder, rectificar y suprimir sus datos en cualquier momento.</p>

                <h3 className="mt-3 font-semibold">3. Consentimiento para teleconsulta</h3>
                <p className="mt-1">El usuario consiente recibir atención médica mediante medios telemáticos conforme a la Ley 26.529 de Derechos del Paciente. La telemedicina tiene limitaciones inherentes y no reemplaza la atención presencial cuando esta sea necesaria. El profesional podrá derivar a consulta presencial según su criterio.</p>

                <h3 className="mt-3 font-semibold">4. Responsabilidades del usuario</h3>
                <p className="mt-1">El usuario se compromete a: proporcionar información veraz y completa, no utilizar la plataforma para obtener recetas sin consulta legítima, no grabar ni difundir las consultas sin consentimiento, y acudir a servicios de emergencia (107/911) ante situaciones urgentes. Uber Doc no es un servicio de emergencias.</p>

                <h3 className="mt-3 font-semibold">5. Política de privacidad</h3>
                <p className="mt-1">Los datos recopilados se utilizan exclusivamente para la prestación del servicio. No se ceden a terceros sin consentimiento expreso, salvo obligación legal. Las consultas y documentos médicos se almacenan de forma segura y encriptada.</p>
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
