"use client";

import { useEffect, useRef, useState, useCallback } from "react";

type Campos = {
  diagnostico: string;
  receta: string;
  indicaciones: string;
  certificado: string;
  // Campos extra para el borrador (ej: medicamentos estructurados)
  [key: string]: unknown;
};

type Estado = "idle" | "saving" | "saved" | "error";

export function useAutoSaveBorrador(
  id: string,
  tipo: "consulta" | "turno",
  campos: Campos
) {
  const [estado, setEstado] = useState<Estado>("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Track last saved value to avoid redundant saves
  const lastSavedRef = useRef<string>("");

  const guardar = useCallback(
    async (camposActuales: Campos) => {
      // No guardar si todos los campos están vacíos
      const hayContenido =
        camposActuales.diagnostico.trim() ||
        camposActuales.receta.trim() ||
        camposActuales.indicaciones.trim() ||
        camposActuales.certificado.trim() ||
        (camposActuales.orden && String(camposActuales.orden).trim()) ||
        (camposActuales.evolucion && String(camposActuales.evolucion).trim());

      if (!hayContenido) return;

      // No guardar si no cambió desde el último save
      const serialized = JSON.stringify(camposActuales);
      if (serialized === lastSavedRef.current) return;

      // Cancelar request anterior si existe
      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setEstado("saving");

      try {
        const res = await fetch(`/api/consulta/${id}/borrador`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          signal: controller.signal,
          body: JSON.stringify({
            tipo,
            borrador: {
              ...camposActuales,
              updated_at: new Date().toISOString(),
            },
          }),
        });

        if (!res.ok) {
          setEstado("error");
          return;
        }

        lastSavedRef.current = serialized;
        setEstado("saved");
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") return;
        setEstado("error");
      }
    },
    [id, tipo]
  );

  // Debounce: 5 segundos después del último cambio
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(() => {
      guardar(campos);
    }, 5000);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [campos.diagnostico, campos.receta, campos.indicaciones, campos.certificado, campos.orden, campos.evolucion, campos.comentario, guardar]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  return { estado };
}
