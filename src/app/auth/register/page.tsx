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
  const [loadingGoogle, setLoadingGoogle] = useState(false);
  const [enviado, setEnviado] = useState(false);

  async function handleGoogle() {
    setLoadingGoogle(true);
    setError(null);
    const supabase = createClient();
    const origin = window.location.origin;
    // En Supabase, "registrarse" y "loguearse" con Google son la misma acción: la
    // primera vez crea la cuenta. Mismo flujo/callback que el login.
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${origin}/auth/callback` },
    });
    if (error) {
      setError(error.message);
      setLoadingGoogle(false);
    }
  }

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

        {/* Google OAuth — mismo botón que el login. Registrarse con Google crea la cuenta. */}
        <div className="mt-8">
          <LoadingButton
            type="button"
            isLoading={loadingGoogle}
            onClick={handleGoogle}
            className="flex w-full items-center justify-center gap-2.5 rounded-[var(--radius-md)] border text-sm font-medium shadow-sm active:scale-[0.97] transition-all duration-100 disabled:opacity-50"
            style={{ height: 44, backgroundColor: "#fff", borderColor: "#d1d5db", color: "var(--color-text-primary)" }}
          >
            <svg width="18" height="18" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M47.532 24.552c0-1.636-.132-3.196-.378-4.688H24.48v9.02h12.992c-.572 2.996-2.26 5.536-4.8 7.236v5.996h7.764c4.548-4.196 7.096-10.376 7.096-17.564z" fill="#4285F4"/>
              <path d="M24.48 48c6.48 0 11.924-2.148 15.9-5.82l-7.764-5.996c-2.148 1.436-4.896 2.284-8.136 2.284-6.256 0-11.552-4.228-13.44-9.908H2.964v6.192C6.924 42.98 15.132 48 24.48 48z" fill="#34A853"/>
              <path d="M11.04 28.56A14.45 14.45 0 0 1 10.2 24c0-1.588.272-3.128.84-4.56v-6.192H2.964A23.964 23.964 0 0 0 .48 24c0 3.876.924 7.548 2.484 10.752l8.076-6.192z" fill="#FBBC05"/>
              <path d="M24.48 9.532c3.528 0 6.692 1.212 9.18 3.588l6.876-6.876C36.396 2.388 30.956 0 24.48 0 15.132 0 6.924 5.02 2.964 13.248l8.076 6.192c1.888-5.68 7.184-9.908 13.44-9.908z" fill="#EA4335"/>
            </svg>
            Continuar con Google
          </LoadingButton>
        </div>

        {/* Separador */}
        <div className="relative my-6 flex items-center">
          <div className="flex-1 border-t" style={{ borderColor: "var(--color-border-default)" }} />
          <span className="mx-3 text-xs" style={{ color: "var(--color-text-tertiary)" }}>o</span>
          <div className="flex-1 border-t" style={{ borderColor: "var(--color-border-default)" }} />
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
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
        {/* Esta pantalla no mencionaba a los médicos ni una vez, y en el celular
            es la única a la que se llega desde la nav: dos médicos reales se
            crearon acá una cuenta de paciente y después tuvieron que quemar
            otro mail para registrarse bien (auditoría 06/08). */}
        <p className="mt-2 text-center text-sm" style={{ color: "var(--color-text-tertiary)" }}>
          ¿Sos médico?{" "}
          <Link href="/auth/registro-medico" className="font-medium" style={{ color: "var(--color-text-link)" }}>
            Registrate acá
          </Link>
        </p>
      </div>
    </div>
  );
}
