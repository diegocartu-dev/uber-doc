"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function BetaAccessForm() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading || !password) return;
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/beta-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        const fromRaw = searchParams.get("from") || "/";
        // Solo aceptar paths internos para evitar open redirect
        const from = fromRaw.startsWith("/") && !fromRaw.startsWith("//") ? fromRaw : "/";
        router.push(from);
        router.refresh();
      } else {
        setError("Contraseña incorrecta");
        setLoading(false);
      }
    } catch {
      setError("No pudimos verificar la contraseña. Probá de nuevo.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Contraseña de acceso"
        className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#378ADD]"
        autoFocus
        autoComplete="current-password"
      />
      {error && <p className="text-left text-xs text-[#E24B4A]">{error}</p>}
      <button
        type="submit"
        disabled={loading || !password}
        className="w-full rounded-xl bg-[#378ADD] py-3 text-sm font-medium text-white transition-colors hover:bg-[#2d6ab5] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? "Verificando..." : "Ingresar"}
      </button>
    </form>
  );
}
