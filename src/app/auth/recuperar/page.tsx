"use client";

import Link from "next/link";
import { useState } from "react";
import { Stethoscope, MailCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import LoadingButton from "@/components/ui/LoadingButton";

// Recuperación de contraseña — autoservicio (14/07/2026). El usuario pide el mail
// acá; el link lo loguea vía /auth/callback y lo lleva a /auth/nueva-contrasena a
// definir la clave nueva. Anti-enumeración: el mensaje de éxito NO revela si la
// cuenta existe. Redirect SIEMPRE a www (el apex 307ea y rompe el flujo).
export default function RecuperarContrasenaPage() {
  const [email, setEmail] = useState("");
  const [enviado, setEnviado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: "https://www.docto.com.ar/auth/callback?next=/auth/nueva-contrasena",
    });

    if (error) {
      // Rate limit de Supabase (1 pedido por minuto). Mensaje neutro: no revela
      // si la cuenta existe.
      if (/security purposes|rate limit|too many/i.test(error.message)) {
        setError("Ya te enviamos un mail hace un momento. Esperá un minuto y volvé a intentar.");
      } else {
        setError("No pudimos enviar el mail. Probá de nuevo en un momento.");
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

  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 flex items-center justify-center gap-2">
          <Stethoscope size={28} strokeWidth={2} color="var(--color-brand)" />
          <span className="text-2xl font-bold" style={{ color: "var(--color-text-primary)" }}>docto</span>
        </Link>

        {enviado ? (
          <div className="rounded-xl bg-white p-6 text-center" style={{ border: "1px solid #e5e7eb" }}>
            <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full" style={{ background: "rgba(55,138,221,0.1)" }}>
              <MailCheck size={28} style={{ color: "#378ADD" }} />
            </span>
            <h2 className="text-lg font-semibold" style={{ color: "var(--color-text-primary)" }}>
              Revisá tu email
            </h2>
            <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--color-text-secondary)" }}>
              Si <strong>{email}</strong> tiene una cuenta en Docto, te enviamos un link para
              restablecer tu contraseña.
            </p>
            <p className="mt-3 text-[13px]" style={{ color: "var(--color-text-secondary)" }}>
              Si no lo ves en tu bandeja principal, revisá en <strong>Spam</strong> o correos no deseados.
            </p>
          </div>
        ) : (
          <>
            <h2 className="text-center text-xl font-semibold" style={{ color: "var(--color-text-primary)" }}>
              Recuperá tu contraseña
            </h2>
            <p className="mt-2 text-center text-sm" style={{ color: "var(--color-text-secondary)" }}>
              Ingresá tu email y te enviamos un link para crear una contraseña nueva.
            </p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              {error && (
                <div
                  className="rounded-[var(--radius-md)] p-3 text-sm"
                  style={{ backgroundColor: "var(--color-danger-soft)", color: "var(--color-danger)" }}
                >
                  {error}
                </div>
              )}

              <div>
                <label htmlFor="email" className="block text-[13px] font-medium" style={{ color: "var(--color-text-secondary)" }}>
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputClass}
                  style={inputStyle}
                  placeholder="tu@email.com"
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
                Enviarme el link
              </LoadingButton>
            </form>
          </>
        )}

        <p className="mt-6 text-center text-sm" style={{ color: "var(--color-text-tertiary)" }}>
          <Link href="/auth/login" className="font-medium" style={{ color: "var(--color-text-link)" }}>
            Volver a iniciar sesión
          </Link>
        </p>
      </div>
    </div>
  );
}
