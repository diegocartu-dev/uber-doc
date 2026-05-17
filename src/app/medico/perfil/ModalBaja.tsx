"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface Props {
  open: boolean;
  onClose: () => void;
  medicoId: string;
}

export default function ModalBaja({ open, onClose, medicoId }: Props) {
  const [input, setInput] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const habilitado = input === "CONFIRMAR";

  if (!open) return null;

  function handleClose() {
    setInput("");
    onClose();
  }

  function handleConfirm() {
    if (!habilitado) return;
    startTransition(async () => {
      const res = await fetch("/api/medico/baja", { method: "POST" });
      if (res.ok) {
        window.dispatchEvent(new Event("docto:voluntary-logout"));
        const supabase = createClient();
        await supabase.auth.signOut();
        router.push("/");
        router.refresh();
      }
    });
  }

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 z-[9999] bg-black/50" onClick={handleClose} />

      {/* Modal — bottom sheet mobile, centered desktop */}
      <div className="fixed inset-x-0 bottom-0 z-[10000] rounded-t-2xl bg-white p-8 lg:inset-auto lg:left-1/2 lg:top-1/2 lg:-translate-x-1/2 lg:-translate-y-1/2 lg:w-full lg:max-w-[400px] lg:rounded-2xl">
        {/* Drag handle mobile */}
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-gray-300 lg:hidden" />
        {/* Close */}
        <button
          onClick={handleClose}
          className="absolute right-4 top-4 text-gray-400 hover:text-gray-600"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>

        <h2 className="text-lg font-semibold text-gray-900">Eliminar cuenta</h2>

        <p className="mt-3 text-sm text-gray-600 leading-relaxed">
          Esta acción es irreversible.<br />
          Se eliminarán todos tus datos, consultas e historial.
        </p>

        <label className="mt-5 block text-sm text-gray-700">
          Escribí CONFIRMAR para continuar:
        </label>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="CONFIRMAR"
          className="mt-2 w-full rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm uppercase focus:outline-none focus:ring-2 focus:ring-[#E24B4A]/40"
          autoComplete="off"
        />

        <button
          onClick={handleConfirm}
          disabled={!habilitado || isPending}
          className="mt-5 w-full rounded-lg py-3.5 text-sm font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-30"
          style={{ backgroundColor: "#E24B4A" }}
        >
          {isPending ? "Eliminando..." : "Eliminar mi cuenta"}
        </button>

        <button
          onClick={handleClose}
          className="mt-3 block w-full py-3 text-center text-sm font-medium text-gray-500"
        >
          Cancelar
        </button>

        {/* Safe area iOS */}
        <div className="h-[env(safe-area-inset-bottom)] lg:hidden" />
      </div>
    </>
  );
}
