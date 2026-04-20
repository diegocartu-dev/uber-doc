"use client";

import Link from "next/link";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Stethoscope } from "lucide-react";
import LoadingButton from "@/components/ui/LoadingButton";

export default function RegisterPage() {
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [enviado, setEnviado] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres.");
      setLoading(false);
      return;
    }

    const supabase = createClient();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: nombre.trim() },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      if (error.message.includes("already registered")) {
        setError("Este email ya tiene una cuenta. Intentá iniciar sesión.");
      } else {
        setError(error.message);
      }
      setLoading(false);
      return;
    }

    setEnviado(true);
    setLoading(false);
  }

  const inputClass =
    "mt-1 block w-full rounded-[var(--radius-md)] border px-3 text-[15px] shadow-sm focus:outline-none";
  const inputStyle: React.CSSProperties = {
    height: 44,
    borderColor: "var(--color-border-strong)",
    color: "var(--color-text-primary)",
  };

  if (enviado) {
    return (
      <div className="flex min-h-full flex-1 flex-col items-center justify-center px-4">
        <div className="w-full max-w-sm text-center">
          <div className="mb-6 flex items-center justify-center gap-2">
            <Stethoscope size={28} strokeWidth={2} color="var(--color-brand)" />
            <span className="text-2xl font-bold" style={{ color: "var(--color-text-primary)" }}>docto</span>
          </div>
          <div className="rounded-xl bg-white p-6" style={{ border: "1px solid #e5e7eb" }}>
            <h2 className="text-lg font-semibold" style={{ color: "var(--color-text-primary)" }}>
              Revisá tu email
            </h2>
            <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--color-text-secondary)" }}>
              Te enviamos un link de confirmación a <strong>{email}</strong>. Hacé click en el link para activar tu cuenta.
            </p>
            <p className="mt-4 text-xs" style={{ color: "var(--color-text-tertiary)" }}>
              Si no lo ves, revisá la carpeta de spam.
            </p>
          </div>
          <Link
            href="/auth/login"
            className="mt-6 inline-block text-sm font-medium"
            style={{ color: "var(--color-text-link)" }}
          >
            ← Volver a iniciar sesión
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 flex items-center justify-center gap-2">
          <Stethoscope size={28} strokeWidth={2} color="var(--color-brand)" />
          <span className="text-2xl font-bold" style={{ color: "var(--color-text-primary)" }}>docto</span>
        </Link>

        <h2 className="text-center text-xl font-semibold" style={{ color: "var(--color-text-primary)" }}>
          Creá tu cuenta
        </h2>
        <p className="mt-2 text-center text-sm" style={{ color: "var(--color-text-tertiary)" }}>
          Registrate para acceder a consultas médicas virtuales
        </p>

        {error && (
          <div
            className="mt-4 rounded-[var(--radius-md)] p-3 text-sm"
            style={{ backgroundColor: "var(--color-danger-soft)", color: "var(--color-danger)" }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <div>
            <label htmlFor="nombre" className="block text-[13px] font-medium" style={{ color: "var(--color-text-secondary)" }}>
              Nombre completo
            </label>
            <input
              id="nombre"
              type="text"
              required
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className={inputClass}
              style={inputStyle}
              placeholder="Juan Pérez"
              onFocus={(e) => { e.currentTarget.style.borderColor = "var(--color-primary)"; e.currentTarget.style.boxShadow = "var(--shadow-focus)"; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = "var(--color-border-strong)"; e.currentTarget.style.boxShadow = "none"; }}
            />
          </div>

          <div>
            <label htmlFor="email" className="block text-[13px] font-medium" style={{ color: "var(--color-text-secondary)" }}>
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
              style={inputStyle}
              placeholder="tu@email.com"
              onFocus={(e) => { e.currentTarget.style.borderColor = "var(--color-primary)"; e.currentTarget.style.boxShadow = "var(--shadow-focus)"; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = "var(--color-border-strong)"; e.currentTarget.style.boxShadow = "none"; }}
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-[13px] font-medium" style={{ color: "var(--color-text-secondary)" }}>
              Contraseña
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
              style={inputStyle}
              placeholder="Mínimo 6 caracteres"
              onFocus={(e) => { e.currentTarget.style.borderColor = "var(--color-primary)"; e.currentTarget.style.boxShadow = "var(--shadow-focus)"; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = "var(--color-border-strong)"; e.currentTarget.style.boxShadow = "none"; }}
            />
          </div>

          <LoadingButton
            type="submit"
            isLoading={loading}
            className="w-full rounded-[var(--radius-md)] text-sm font-semibold text-white shadow-sm disabled:opacity-50 active:scale-[0.97] transition-all duration-100"
            style={{ height: 44, backgroundColor: "var(--color-primary)" }}
          >
            Crear cuenta
          </LoadingButton>
        </form>

        <p className="mt-6 text-center text-sm" style={{ color: "var(--color-text-tertiary)" }}>
          ¿Ya tenés cuenta?{" "}
          <Link href="/auth/login" className="font-medium" style={{ color: "var(--color-text-link)" }}>
            Iniciá sesión
          </Link>
        </p>
      </div>
    </div>
  );
}
