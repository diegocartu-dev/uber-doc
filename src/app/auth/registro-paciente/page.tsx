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
              <div className="mt-4 h-72 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
                <p className="font-medium">
                  Términos y condiciones del paciente — contenido legal
                  próximamente.
                </p>
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
