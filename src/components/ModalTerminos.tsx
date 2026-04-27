"use client";

import { useEffect, useCallback } from "react";
import { X } from "lucide-react";
import TerminosContent from "@/app/terminos/TerminosContent";

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function ModalTerminos({ open, onClose }: Props) {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, handleKeyDown]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl" style={{ maxHeight: "90vh", display: "flex", flexDirection: "column" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">
            Términos y Condiciones de Uso
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} strokeWidth={1.75} />
          </button>
        </div>

        <div className="mt-4 flex-1 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-5 text-sm leading-relaxed text-gray-700">
          <TerminosContent hideTitle />
        </div>

        <button
          onClick={onClose}
          className="mt-4 w-full rounded-[var(--radius-md)] px-4 py-2.5 text-sm font-medium text-white active:scale-[0.97] transition-all duration-100"
          style={{ backgroundColor: "#378ADD" }}
        >
          Cerrar
        </button>
      </div>
    </div>
  );
}
