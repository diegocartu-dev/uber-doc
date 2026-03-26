"use client";

import Link from "next/link";
import { useState } from "react";
import { registrarPaciente } from "./actions";

export default function RegistroPacientePage() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "Registrando..." : "Registrarme como paciente"}
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
