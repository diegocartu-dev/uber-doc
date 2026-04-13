"use client";

import { useState } from "react";
import Link from "next/link";
import { Stethoscope } from "lucide-react";

export default function Home() {
  const [email, setEmail] = useState("");
  const [estado, setEstado] = useState<"idle" | "loading" | "ok" | "ya" | "error">("idle");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setEstado("loading");
    try {
      const res = await fetch("/api/pre-registro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) { setEstado("error"); return; }
      setEstado(data.ya_registrado ? "ya" : "ok");
    } catch {
      setEstado("error");
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white px-4">
      {/* Logo */}
      <div className="flex items-center gap-2 mb-12">
        <Stethoscope size={28} strokeWidth={2} color="#1D9E75" />
        <span className="text-2xl font-bold lowercase" style={{ color: "#1a1a1a" }}>
          docto
        </span>
      </div>

      {/* Headline */}
      <div className="max-w-md text-center">
        <div
          className="mb-4 inline-block rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-widest"
          style={{ background: "#f0faf6", color: "#1D9E75" }}
        >
          Beta cerrada
        </div>
        <h1 className="text-3xl font-bold" style={{ color: "#1a1a1a" }}>
          Tu médico, a un click
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed" style={{ color: "#6b7280" }}>
          Estamos preparando el lanzamiento de Docto. Dejanos tu email y te avisamos cuando tengas acceso.
        </p>
      </div>

      {/* Formulario pre-registro */}
      <div className="mt-8 w-full max-w-sm">
        {estado === "ok" && (
          <div
            className="rounded-xl px-4 py-3 text-center text-sm font-medium"
            style={{ background: "#f0faf6", color: "#1D9E75" }}
          >
            Anotado. Te avisamos cuando abramos el acceso.
          </div>
        )}
        {estado === "ya" && (
          <div
            className="rounded-xl px-4 py-3 text-center text-sm font-medium"
            style={{ background: "#f0faf6", color: "#1D9E75" }}
          >
            Ya estabas en la lista. Te vamos a avisar.
          </div>
        )}
        {estado !== "ok" && estado !== "ya" && (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@email.com"
              className="w-full rounded-xl px-4 py-3 text-sm outline-none transition-shadow focus:ring-2 focus:ring-[#1D9E75]/30"
              style={{
                border: "1px solid #e5e7eb",
                color: "#1a1a1a",
              }}
            />
            <button
              type="submit"
              disabled={estado === "loading"}
              className="w-full rounded-xl py-3 text-sm font-semibold text-white transition-all active:scale-[0.98] disabled:opacity-60"
              style={{ background: "#1D9E75" }}
            >
              {estado === "loading" ? "Guardando..." : "Quiero acceso"}
            </button>
            {estado === "error" && (
              <p className="text-center text-xs" style={{ color: "#E24B4A" }}>
                Algo salió mal. Intentá de nuevo.
              </p>
            )}
          </form>
        )}
      </div>

      {/* Ya tengo cuenta */}
      <p className="mt-8 text-sm" style={{ color: "#9ca3af" }}>
        Ya tenés acceso?{" "}
        <Link
          href="/auth/login"
          className="font-medium transition-colors hover:underline"
          style={{ color: "#1D9E75" }}
        >
          Iniciar sesion
        </Link>
      </p>
    </div>
  );
}
