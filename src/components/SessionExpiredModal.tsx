"use client";

import { Lock } from "lucide-react";

export default function SessionExpiredModal() {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60">
      <div className="mx-4 w-full max-w-sm rounded-2xl bg-white p-8 text-center shadow-xl">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gray-100">
          <Lock className="h-7 w-7 text-gray-500" />
        </div>

        <h2 className="mb-2 text-xl font-semibold text-gray-900">
          Tu sesión expiró
        </h2>

        <p className="mb-6 text-sm text-gray-600">
          Por seguridad, tu sesión se cerró automáticamente. Volvé a iniciar
          sesión para continuar atendiendo.
        </p>

        <button
          onClick={() => {
            window.location.href = "/auth/login";
          }}
          className="w-full rounded-lg bg-[#378ADD] px-4 py-3 text-base font-medium text-white transition-colors hover:bg-[#2d75c4]"
        >
          Iniciar sesión
        </button>
      </div>
    </div>
  );
}
