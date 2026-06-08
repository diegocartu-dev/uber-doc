"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { capitalizarNombre } from "@/lib/utils/texto";

type Props = {
  tipo: "consulta" | "turno";
  id: string;
  pacienteNombre: string;
  onDismiss: () => void;
};

export default function NotificacionPacienteListo({ tipo, id, pacienteNombre, onDismiss }: Props) {
  const [visible, setVisible] = useState(false);
  const router = useRouter();

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  function handleIniciar() {
    if (tipo === "turno") {
      router.push(`/turno/${id}/video`);
    } else {
      router.push(`/medico/consulta/${id}/workspace`);
    }
  }

  // CI: el paciente pagó. Turno: el paciente llegó a la sala de espera.
  const titulo = tipo === "turno"
    ? `${capitalizarNombre(pacienteNombre)} llegó`
    : `${capitalizarNombre(pacienteNombre)} pagó`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        background: "rgba(0,0,0,0.45)",
        opacity: visible ? 1 : 0,
        transition: "opacity 0.25s ease-out",
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 18,
          width: "min(420px, 100%)",
          padding: "28px 24px 20px",
          boxShadow: "0 24px 60px rgba(0,0,0,0.22), 0 8px 20px rgba(0,0,0,0.10)",
          transform: visible ? "translateY(0) scale(1)" : "translateY(12px) scale(0.97)",
          transition: "transform 0.25s ease-out",
          textAlign: "center",
        }}
      >
        {/* Ícono check verde — verde = estado (pagado/listo) */}
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: "50%",
            background: "#1D9E7515",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 16px",
          }}
        >
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#1D9E75" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </div>

        <p style={{ fontSize: 22, fontWeight: 700, color: "#1a1a1a", margin: 0, lineHeight: 1.25 }}>
          {titulo}
        </p>
        <p style={{ fontSize: 15, color: "#888780", margin: "6px 0 0" }}>
          Listo para la consulta
        </p>

        <button
          type="button"
          onClick={handleIniciar}
          style={{
            marginTop: 24,
            width: "100%",
            minHeight: 56,
            background: "#378ADD",
            color: "#fff",
            border: 0,
            borderRadius: 12,
            fontSize: 17,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Iniciar consulta
        </button>

        <button
          type="button"
          onClick={onDismiss}
          style={{
            marginTop: 12,
            width: "100%",
            minHeight: 44,
            background: "transparent",
            border: 0,
            color: "#888780",
            fontSize: 15,
            cursor: "pointer",
          }}
        >
          Ahora no
        </button>
      </div>
    </div>
  );
}
