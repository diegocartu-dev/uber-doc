"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { aceptarConsulta } from "@/app/sala-espera/[consultaId]/actions";

type Props = {
  pacienteNombre: string;
  esperandoDesde: string;
  consultaId: string;
  tipo: "consulta" | "turno";
  onDismiss: () => void;
};

function minutosEsperando(desde: string): number {
  const diff = Date.now() - new Date(desde).getTime();
  return Math.max(0, Math.floor(diff / 60000));
}

export default function NotificacionEspera({ pacienteNombre, esperandoDesde, consultaId, tipo, onDismiss }: Props) {
  const [mins, setMins] = useState(() => minutosEsperando(esperandoDesde));
  const [visible, setVisible] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  useEffect(() => {
    const interval = setInterval(() => setMins(minutosEsperando(esperandoDesde)), 30000);
    return () => clearInterval(interval);
  }, [esperandoDesde]);

  const href = tipo === "turno" ? `/turno/${consultaId}/video` : `/medico/consulta/${consultaId}/workspace`;

  function handleAceptar() {
    startTransition(async () => {
      await aceptarConsulta(consultaId);
      router.push(href);
    });
  }

  return (
    <div
      style={{
        position: "fixed",
        top: visible ? 16 : -120,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 9999,
        transition: "top 0.3s ease-out",
        width: "min(420px, calc(100vw - 32px))",
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 14,
          border: "1px solid #e5e7eb",
          boxShadow: "0 12px 40px rgba(0,0,0,0.12), 0 4px 12px rgba(0,0,0,0.06)",
          padding: "14px 16px",
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: "50%",
            background: "#378ADD15",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#378ADD" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 16, fontWeight: 600, color: "#1a1a1a", margin: 0 }}>
            {pacienteNombre} está esperando
          </p>
          <p style={{ fontSize: 14, color: "#888780", margin: "2px 0 0" }}>
            {mins < 1 ? "Recién ingresó" : `${mins} min en sala de espera`}
          </p>
        </div>

        {tipo === "consulta" ? (
          <button
            onClick={handleAceptar}
            disabled={isPending}
            style={{
              background: "#378ADD",
              color: "#fff",
              border: 0,
              borderRadius: 10,
              padding: "10px 16px",
              fontSize: 14,
              fontWeight: 600,
              cursor: isPending ? "default" : "pointer",
              whiteSpace: "nowrap",
              flexShrink: 0,
              opacity: isPending ? 0.7 : 1,
            }}
          >
            {isPending ? "Aceptando..." : "Aceptar"}
          </button>
        ) : (
          <Link
            href={href}
            style={{
              background: "#378ADD",
              color: "#fff",
              border: 0,
              borderRadius: 10,
              padding: "10px 16px",
              fontSize: 14,
              fontWeight: 600,
              textDecoration: "none",
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            Atender ahora
          </Link>
        )}

        <button
          onClick={onDismiss}
          style={{
            background: "transparent",
            border: 0,
            padding: 4,
            cursor: "pointer",
            color: "#888780",
            flexShrink: 0,
          }}
          aria-label="Cerrar notificación"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  );
}
