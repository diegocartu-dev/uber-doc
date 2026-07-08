"use client";

import { useEffect } from "react";

// Error boundary global de la app. Antes de esto NO existía ninguna: cualquier throw de
// un client component desmontaba el árbol entero y dejaba la página nativa muerta del
// browser ("This page couldn't load") — incidente del dashboard médico 08/07/2026.
// Acá el usuario ve algo de Docto y tiene salida (reintentar / ir al inicio).
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[error-boundary]", error.message, error.digest ?? "");
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#f8f9fa] px-6 text-center">
      <p className="text-4xl">😕</p>
      <h1 className="mt-4 text-xl font-semibold text-gray-900">Algo salió mal</h1>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-gray-500">
        Hubo un problema al mostrar esta pantalla. Tus datos están a salvo — probá de nuevo.
      </p>
      <div className="mt-6 flex gap-3">
        <button
          onClick={reset}
          className="rounded-lg bg-[#378ADD] px-5 py-2.5 text-sm font-medium text-white transition hover:bg-[#2d75c4] active:scale-[0.97]"
        >
          Reintentar
        </button>
        <a
          href="/dashboard"
          className="rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-600 transition hover:bg-white"
        >
          Ir al inicio
        </a>
      </div>
    </div>
  );
}
