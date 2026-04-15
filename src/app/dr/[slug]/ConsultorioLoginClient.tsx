"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import LoadingButton from "@/components/ui/LoadingButton";

type Props = {
  slug: string;
};

export default function ConsultorioLoginClient({ slug }: Props) {
  const [email, setEmail] = useState("");
  const [loadingGoogle, setLoadingGoogle] = useState(false);
  const [loadingMagic, setLoadingMagic] = useState(false);
  const [magicEnviado, setMagicEnviado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGoogle() {
    setLoadingGoogle(true);
    setError(null);
    const supabase = createClient();
    const origin = window.location.origin;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${origin}/auth/callback?next=/dr/${slug}/consultorio` },
    });
    if (error) {
      setError(error.message);
      setLoadingGoogle(false);
    }
  }

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setLoadingMagic(true);
    setError(null);
    const supabase = createClient();
    const origin = window.location.origin;
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${origin}/auth/callback?next=/dr/${slug}/consultorio` },
    });
    if (error) {
      setError(error.message);
      setLoadingMagic(false);
      return;
    }
    setMagicEnviado(true);
    setLoadingMagic(false);
  }

  return (
    <div className="mt-8 space-y-4 w-full">
      {error && (
        <div
          className="rounded-[var(--radius-md)] p-3 text-sm"
          style={{ backgroundColor: "var(--color-danger-soft)", color: "var(--color-danger)" }}
        >
          {error}
        </div>
      )}

      {/* Google OAuth */}
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

      {/* Separador */}
      <div className="relative flex items-center">
        <div className="flex-1 border-t" style={{ borderColor: "var(--color-border-default)" }} />
        <span className="mx-3 text-xs" style={{ color: "var(--color-text-tertiary)" }}>o</span>
        <div className="flex-1 border-t" style={{ borderColor: "var(--color-border-default)" }} />
      </div>

      {/* Magic Link */}
      {magicEnviado ? (
        <div
          className="rounded-[var(--radius-md)] p-4 text-sm text-center leading-relaxed"
          style={{ backgroundColor: "var(--color-success-soft)", color: "var(--color-success)" }}
        >
          Revis&aacute; tu email &mdash; te enviamos un link para entrar
        </div>
      ) : (
        <form onSubmit={handleMagicLink} className="space-y-3">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@email.com"
            className="block w-full rounded-[var(--radius-md)] border px-3 text-[15px] shadow-sm focus:outline-none"
            style={{ height: 44, borderColor: "var(--color-border-strong)", color: "var(--color-text-primary)" }}
            onFocus={(e) => { e.currentTarget.style.borderColor = "var(--color-primary)"; e.currentTarget.style.boxShadow = "var(--shadow-focus)"; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = "var(--color-border-strong)"; e.currentTarget.style.boxShadow = "none"; }}
          />
          <LoadingButton
            type="submit"
            isLoading={loadingMagic}
            className="w-full rounded-[var(--radius-md)] text-sm font-semibold text-white shadow-sm disabled:opacity-50 active:scale-[0.97] transition-all duration-100"
            style={{ height: 44, backgroundColor: "#1D9E75" }}
          >
            Enviame un link para entrar
          </LoadingButton>
        </form>
      )}
    </div>
  );
}
