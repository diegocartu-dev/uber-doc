"use client";

import { useState } from "react";
import Link from "next/link";
import { Stethoscope, Loader2, CheckCircle } from "lucide-react";

export default function RegistroCerradoPage() {
  const [email, setEmail] = useState("");
  const [nombre, setNombre] = useState("");
  const [provincia, setProvincia] = useState("");
  const [tipo, setTipo] = useState<"paciente" | "medico">("paciente");
  const [especialidad, setEspecialidad] = useState("");
  const [enviado, setEnviado] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState<number | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/lista-espera", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, tipo, nombre, provincia, especialidad }),
      });
      const data = await res.json();
      if (data.ok) {
        setEnviado(true);
        setTotal(data.total);
      } else {
        setError(data.error || "Error al registrar");
      }
    } catch {
      setError("Error de conexion");
    }
    setLoading(false);
  }

  const inputClass =
    "mt-1 block w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-700 placeholder-gray-400 focus:border-[#378ADD] focus:outline-none focus:ring-1 focus:ring-[#378ADD]";

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4 py-12">
      <div className="w-full max-w-md">
        {/* Logo */}
        <Link href="/" className="mb-8 flex items-center justify-center gap-2">
          <Stethoscope size={28} strokeWidth={2} color="#378ADD" />
          <span className="text-2xl font-bold text-gray-900">docto</span>
        </Link>

        {enviado ? (
          <div className="rounded-xl bg-white p-8 text-center" style={{ border: "1px solid #e5e7eb" }}>
            <CheckCircle size={48} className="mx-auto text-[#1D9E75]" />
            <h2 className="mt-4 text-lg font-semibold text-gray-900">
              Te anotamos
            </h2>
            <p className="mt-2 text-sm text-gray-500">
              Te vamos a avisar a <strong>{email}</strong> cuando abramos el registro.
            </p>
            {total && total > 1 && (
              <p className="mt-4 text-xs text-gray-400">
                Ya somos {total} personas esperando
              </p>
            )}
            <Link
              href="/"
              className="mt-6 inline-block text-sm font-medium text-[#378ADD]"
            >
              Volver al inicio
            </Link>
          </div>
        ) : (
          <div className="rounded-xl bg-white p-8" style={{ border: "1px solid #e5e7eb" }}>
            <h2 className="text-center text-xl font-semibold text-gray-900">
              Docto esta en beta cerrada
            </h2>
            <p className="mt-2 text-center text-sm text-gray-500">
              Estamos preparando la plataforma para el lanzamiento. Dejanos tu email y te avisamos cuando abramos.
            </p>

            {error && (
              <div className="mt-4 rounded-lg bg-red-50 p-3 text-center text-sm text-[#E24B4A]">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              {/* Tipo */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setTipo("paciente")}
                  className={`flex-1 rounded-lg py-2.5 text-sm font-medium transition ${
                    tipo === "paciente"
                      ? "bg-[#378ADD] text-white"
                      : "border border-gray-200 text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  Soy paciente
                </button>
                <button
                  type="button"
                  onClick={() => setTipo("medico")}
                  className={`flex-1 rounded-lg py-2.5 text-sm font-medium transition ${
                    tipo === "medico"
                      ? "bg-[#378ADD] text-white"
                      : "border border-gray-200 text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  Soy medico/a
                </button>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500">Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@email.com"
                  className={inputClass}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500">Nombre (opcional)</label>
                <input
                  type="text"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Tu nombre"
                  className={inputClass}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500">Provincia (opcional)</label>
                <input
                  type="text"
                  value={provincia}
                  onChange={(e) => setProvincia(e.target.value)}
                  placeholder="Ej: Buenos Aires"
                  className={inputClass}
                />
              </div>

              {tipo === "medico" && (
                <div>
                  <label className="block text-xs font-medium text-gray-500">Especialidad</label>
                  <input
                    type="text"
                    value={especialidad}
                    onChange={(e) => setEspecialidad(e.target.value)}
                    placeholder="Ej: Clinica medica"
                    className={inputClass}
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !email}
                className="w-full rounded-lg bg-[#378ADD] py-3 text-sm font-semibold text-white transition hover:bg-[#2d75c4] disabled:opacity-50"
                style={{ minHeight: 44 }}
              >
                {loading ? (
                  <Loader2 size={16} className="mx-auto animate-spin" />
                ) : (
                  "Avisame cuando abran"
                )}
              </button>
            </form>

            <p className="mt-6 text-center text-xs text-gray-400">
              Si ya tenes cuenta,{" "}
              <Link href="/auth/login" className="text-[#378ADD] underline">
                inicia sesion
              </Link>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
