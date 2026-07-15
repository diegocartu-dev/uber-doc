"use client";

import Link from "next/link";
import { useState } from "react";
import { Stethoscope, Eye, EyeOff, CheckCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import LoadingButton from "@/components/ui/LoadingButton";

// Un solo campo + mostrar/ocultar (sin "repetí la contraseña"): con el ojo a la
// vista, tipear dos veces en máscara es más fricción y más error para el usuario
// primario (médico de 70 en el celular) que verificar visualmente. Decisión de
// diseño de Sofía en el gate del 14/07.
export default function NuevaContrasena({ email }: { email: string }) {
  const [password, setPassword] = useState("");
  const [mostrar, setMostrar] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [listo, setListo] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      if (/different from the old/i.test(error.message)) {
        setError("La contraseña nueva tiene que ser distinta a la anterior.");
      } else {
        setError("No pudimos guardar la contraseña. Probá de nuevo en un momento.");
      }
      setLoading(false);
      return;
    }

    setListo(true);
    setLoading(false);
  }

  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 flex items-center justify-center gap-2">
          <Stethoscope size={28} strokeWidth={2} color="var(--color-brand)" />
          <span className="text-2xl font-bold" style={{ color: "var(--color-text-primary)" }}>docto</span>
        </Link>

        {listo ? (
          <div className="rounded-xl bg-white p-6 text-center" style={{ border: "1px solid var(--color-border-default)" }}>
            <CheckCircle size={40} className="mx-auto mb-3" style={{ color: "var(--color-success)" }} />
            <h2 className="text-lg font-semibold" style={{ color: "var(--color-text-primary)" }}>
              Contraseña actualizada
            </h2>
            <p className="mt-2 text-sm" style={{ color: "var(--color-text-secondary)" }}>
              Ya podés usarla la próxima vez que ingreses.
            </p>
            <a
              href="/dashboard"
              className="mt-5 inline-block w-full rounded-[var(--radius-md)] px-4 py-2.5 text-sm font-semibold text-white active:scale-[0.97] transition-all duration-100"
              style={{ backgroundColor: "var(--color-primary)" }}
            >
              Ir a mi cuenta
            </a>
          </div>
        ) : (
          <>
            <h2 className="text-center text-xl font-semibold" style={{ color: "var(--color-text-primary)" }}>
              Creá tu contraseña nueva
            </h2>
            <p className="mt-2 text-center text-sm" style={{ color: "var(--color-text-secondary)" }}>
              Para la cuenta <strong>{email}</strong>
            </p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              {error && (
                <div
                  role="alert"
                  className="rounded-[var(--radius-md)] p-3 text-sm"
                  style={{ backgroundColor: "var(--color-danger-soft)", color: "var(--color-danger)" }}
                >
                  {error}
                </div>
              )}

              <div>
                <label htmlFor="password" className="block text-[13px] font-medium" style={{ color: "var(--color-text-secondary)" }}>
                  Contraseña nueva
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={mostrar ? "text" : "password"}
                    required
                    minLength={8}
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="mt-1 block w-full rounded-[var(--radius-md)] border px-3 pr-11 text-[15px] shadow-sm focus:outline-none"
                    style={{ height: 44, borderColor: "var(--color-border-strong)", color: "var(--color-text-primary)" }}
                    placeholder="Mínimo 8 caracteres"
                    onFocus={(e) => { e.currentTarget.style.borderColor = "var(--color-primary)"; e.currentTarget.style.boxShadow = "var(--shadow-focus)"; }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = "var(--color-border-strong)"; e.currentTarget.style.boxShadow = "none"; }}
                  />
                  <button
                    type="button"
                    onClick={() => setMostrar((v) => !v)}
                    aria-label={mostrar ? "Ocultar contraseña" : "Mostrar contraseña"}
                    className="absolute inset-y-0 right-0 mt-1 flex items-center px-3"
                    style={{ color: "var(--color-text-tertiary)" }}
                  >
                    {mostrar ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <LoadingButton
                type="submit"
                isLoading={loading}
                className="w-full rounded-[var(--radius-md)] text-sm font-semibold text-white shadow-sm disabled:opacity-50 active:scale-[0.97] transition-all duration-100"
                style={{ height: 44, backgroundColor: "var(--color-primary)" }}
              >
                Guardar contraseña
              </LoadingButton>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
