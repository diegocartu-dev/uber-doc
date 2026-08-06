"use client";

import Link from "next/link";
import { useState } from "react";
import { Stethoscope, MailCheck, Eye, EyeOff } from "lucide-react";
import { iniciarRegistroMedico, reenviarConfirmacionMedico } from "./actions";
import LoadingButton from "@/components/ui/LoadingButton";

// Rediseño 14/07/2026 — FASE A del registro médico: crear la cuenta con lo
// mínimo (nombre + email + contraseña) y mandar el mail de validación. Los datos
// profesionales + credencial + biometría se completan DESPUÉS de confirmar el
// mail, ya logueado (/registro-medico/continuar). Spec: docs/specs/2026-07-14.
export default function RegistroMedicoPage() {
  const [enviadoA, setEnviadoA] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [yaExiste, setYaExiste] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mostrarPwd, setMostrarPwd] = useState(false);
  const [reenviando, setReenviando] = useState(false);
  const [reenviado, setReenviado] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setYaExiste(false);
    const fdCheck = new FormData(e.currentTarget);
    // Pedido de Diego (15/07): repetir la contraseña para salvar errores de tipeo.
    if (fdCheck.get("password") !== fdCheck.get("password_confirmar")) {
      setError("Las contraseñas no coinciden. Revisalas.");
      return;
    }
    setLoading(true);
    try {
      const fd = fdCheck;
      const r = await iniciarRegistroMedico(fd);
      if (r?.error) {
        setError(r.error);
        setYaExiste(Boolean((r as { yaExiste?: boolean }).yaExiste));
        setLoading(false);
        return;
      }
      setEnviadoA((r?.email as string) ?? (fd.get("email") as string));
    } catch {
      setError("No se pudo crear la cuenta. Probá de nuevo en un momento.");
      setLoading(false);
    }
  }

  async function handleReenviar() {
    if (!enviadoA) return;
    setReenviando(true);
    setReenviado(false);
    try {
      await reenviarConfirmacionMedico(enviadoA);
      setReenviado(true);
    } finally {
      setReenviando(false);
    }
  }

  function usarOtroEmail() {
    setEnviadoA(null);
    setReenviado(false);
    setError(null);
    setLoading(false);
  }

  const inputClass =
    "mt-1 block w-full h-11 rounded-[var(--radius-md)] border border-gray-300 px-3 text-[15px] shadow-sm focus:outline-none focus:border-[#378ADD] focus:ring-2 focus:ring-[#378ADD]/30";
  const labelClass = "block text-[13px] font-medium text-gray-700";

  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-6 flex items-center justify-center gap-2">
          <Stethoscope size={28} strokeWidth={2} color="var(--color-brand)" />
          <span className="text-2xl font-bold" style={{ color: "var(--color-text-primary)" }}>docto</span>
        </Link>

        {enviadoA ? (
          // ── Mensaje inmediato: revisá tu mail (incluí spam) ──
          <div className="rounded-2xl border border-gray-100 bg-white p-6 text-center shadow-sm">
            <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full" style={{ background: "rgba(55,138,221,0.1)" }}>
              <MailCheck size={28} style={{ color: "#378ADD" }} />
            </span>
            <h2 className="text-xl font-semibold text-gray-900">Revisá tu email</h2>
            <p className="mt-2 text-sm leading-relaxed text-gray-600">
              Te enviamos un mail a <strong className="text-gray-800">{enviadoA}</strong> para
              validar la creación de tu cuenta.
            </p>
            <div className="mt-4 rounded-xl px-4 py-3 text-left" style={{ background: "rgba(186,117,23,0.08)" }}>
              <p className="text-sm leading-relaxed" style={{ color: "#BA7517" }}>
                Si no lo ves en tu bandeja principal, revisá en <strong>Spam</strong> o correos
                no deseados. <strong>Seguí la registración desde ahí.</strong>
              </p>
            </div>
            <p className="mt-5 text-[13px] text-gray-500">
              Al tocar el link del mail vas a entrar y continuar tu registro.
            </p>

            {/* Salidas: reenviar / corregir email — evita el callejón sin salida */}
            <div className="mt-5 border-t border-gray-100 pt-4">
              {reenviado ? (
                <p className="text-[13px] font-medium" style={{ color: "#1D9E75" }}>
                  Te lo reenviamos. Revisá tu bandeja (y el spam).
                </p>
              ) : (
                <button
                  type="button"
                  onClick={handleReenviar}
                  disabled={reenviando}
                  className="text-[13px] font-medium underline disabled:opacity-50"
                  style={{ color: "#378ADD" }}
                >
                  {reenviando ? "Reenviando…" : "¿No te llegó? Reenviar mail"}
                </button>
              )}
              <div className="mt-2">
                <button
                  type="button"
                  onClick={usarOtroEmail}
                  className="text-[13px] font-medium text-gray-500 underline"
                >
                  Usar otro email
                </button>
              </div>
            </div>
          </div>
        ) : (
          // ── Crear cuenta (lo mínimo) ──
          <>
            <h2 className="text-center text-xl font-semibold text-gray-900">Creá tu cuenta</h2>
            <p className="mt-1 text-center text-sm text-gray-500">
              Empezá con lo básico. Los datos profesionales van en los siguientes pasos.
            </p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              {error && (
                <div className="rounded-lg p-3 text-sm" style={{ backgroundColor: "rgba(226,75,74,0.08)", color: "#E24B4A" }}>
                  {error}
                  {/* Si el mail ya tiene cuenta, el mensaje solo no alcanza:
                      hay que darle los dos botones que lo sacan de acá. */}
                  {yaExiste && (
                    <div className="mt-3 flex flex-wrap gap-3">
                      <Link
                        href="/auth/login"
                        className="rounded-lg px-3 py-2 text-[13px] font-semibold text-white"
                        style={{ backgroundColor: "#378ADD" }}
                      >
                        Iniciar sesión
                      </Link>
                      <Link
                        href="/auth/recuperar"
                        className="rounded-lg px-3 py-2 text-[13px] font-semibold"
                        style={{ border: "1.5px solid #378ADD", color: "#378ADD" }}
                      >
                        Recuperar contraseña
                      </Link>
                    </div>
                  )}
                </div>
              )}

              <div>
                <label htmlFor="nombre_completo" className={labelClass}>Nombre y apellido</label>
                <input id="nombre_completo" name="nombre_completo" type="text" required autoComplete="name" className={inputClass} placeholder="María Pérez" />
              </div>
              <div>
                <label htmlFor="email" className={labelClass}>Email</label>
                <input id="email" name="email" type="email" required autoComplete="email" className={inputClass} placeholder="doctor@email.com" />
              </div>
              <div>
                <label htmlFor="password" className={labelClass}>Contraseña</label>
                <div className="relative">
                  <input
                    id="password"
                    name="password"
                    type={mostrarPwd ? "text" : "password"}
                    required
                    minLength={8}
                    autoComplete="new-password"
                    className={inputClass + " pr-11"}
                    placeholder="Mínimo 8 caracteres"
                  />
                  <button
                    type="button"
                    onClick={() => setMostrarPwd((v) => !v)}
                    aria-label={mostrarPwd ? "Ocultar contraseña" : "Mostrar contraseña"}
                    className="absolute inset-y-0 right-0 mt-1 flex items-center px-3 text-gray-500 hover:text-gray-700"
                  >
                    {mostrarPwd ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
              <div>
                <label htmlFor="password_confirmar" className={labelClass}>Repetí la contraseña</label>
                <input
                  id="password_confirmar"
                  name="password_confirmar"
                  type={mostrarPwd ? "text" : "password"}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  className={inputClass}
                />
              </div>

              <LoadingButton
                type="submit"
                isLoading={loading}
                className="h-11 w-full rounded-[var(--radius-md)] px-4 text-sm font-semibold text-white shadow-sm active:scale-[0.98] transition-all"
                style={{ backgroundColor: "#378ADD" }}
              >
                Crear cuenta
              </LoadingButton>
            </form>
          </>
        )}

        <p className="mt-6 text-center text-sm text-gray-600">
          ¿Ya tenés cuenta?{" "}
          <Link href="/auth/login" className="font-medium" style={{ color: "var(--color-text-link)" }}>
            Iniciá sesión
          </Link>
        </p>
      </div>
    </div>
  );
}
