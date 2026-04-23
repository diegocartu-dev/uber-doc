"use client";

import { useState, useEffect, useRef } from "react";
import { Search, ArrowRight, Stethoscope } from "lucide-react";

const ESPECIALIDADES = [
  "Clínica Médica",
  "Cardiología",
  "Dermatología",
  "Pediatría",
  "Ginecología",
  "Psicología",
  "Psiquiatría",
  "Neurología",
  "Nutrición",
  "Endocrinología",
  "Traumatología",
  "Oftalmología",
  "Otorrinolaringología",
  "Urología",
];

export default function Buscador() {
  const [open, setOpen] = useState(false);
  const [esp, setEsp] = useState("");
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const filtered = q
    ? ESPECIALIDADES.filter((e) => e.toLowerCase().includes(q.toLowerCase()))
    : ESPECIALIDADES;

  return (
    <div
      ref={ref}
      style={{
        background: "#fff",
        border: "1px solid var(--color-border-default)",
        borderRadius: 14,
        padding: 6,
        display: "flex",
        alignItems: "center",
        gap: 4,
        boxShadow: "0 8px 28px rgba(15, 23, 32, 0.06), 0 2px 6px rgba(15,23,32,0.04)",
        maxWidth: 620,
        position: "relative",
      }}
    >
      <div style={{ flex: 1, position: "relative" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 14px",
            cursor: "text",
          }}
          onClick={() => setOpen(true)}
        >
          <Search size={18} style={{ color: "var(--color-text-tertiary)", flexShrink: 0 }} />
          <input
            type="text"
            placeholder="Especialidad o nombre del médico"
            value={esp || q}
            onChange={(e) => {
              setQ(e.target.value);
              setEsp("");
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            style={{
              flex: 1,
              border: 0,
              outline: "none",
              fontSize: 15,
              color: "var(--color-text-primary)",
              background: "transparent",
              fontFamily: "inherit",
              minWidth: 0,
            }}
          />
        </div>
        {open && (
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 10px)",
              left: -6,
              right: -6,
              background: "#fff",
              border: "1px solid var(--color-border-default)",
              borderRadius: 14,
              boxShadow: "0 18px 40px rgba(15,23,32,0.10), 0 4px 12px rgba(15,23,32,0.06)",
              padding: 8,
              maxHeight: 320,
              overflow: "auto",
              zIndex: 10,
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "var(--color-text-tertiary)",
                padding: "8px 12px 6px",
              }}
            >
              Especialidades
            </div>
            {filtered.slice(0, 8).map((e) => (
              <button
                key={e}
                onClick={() => {
                  setEsp(e);
                  setQ("");
                  setOpen(false);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  width: "100%",
                  padding: "10px 12px",
                  border: 0,
                  background: "transparent",
                  textAlign: "left",
                  fontSize: 14,
                  color: "var(--color-text-primary)",
                  borderRadius: 8,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
                onMouseEnter={(ev) => (ev.currentTarget.style.background = "var(--color-bg-tertiary)")}
                onMouseLeave={(ev) => (ev.currentTarget.style.background = "transparent")}
              >
                <Stethoscope size={16} style={{ color: "var(--color-brand-indigo)" }} />
                {e}
              </button>
            ))}
            {filtered.length === 0 && (
              <div style={{ padding: "16px 12px", fontSize: 13, color: "var(--color-text-tertiary)" }}>
                No encontramos esa especialidad. Probá con otra.
              </div>
            )}
          </div>
        )}
      </div>
      <button
        className="buscador-btn"
        style={{
          background: "var(--color-primary)",
          color: "#fff",
          border: 0,
          padding: "12px 22px",
          borderRadius: 10,
          fontSize: 14,
          fontWeight: 600,
          display: "flex",
          alignItems: "center",
          gap: 8,
          whiteSpace: "nowrap",
          cursor: "pointer",
          fontFamily: "inherit",
          flexShrink: 0,
        }}
      >
        <span className="buscador-btn-text">Buscar médico</span>
        <ArrowRight size={16} />
      </button>
      <style>{`
        @media (max-width: 720px) {
          .buscador-btn { padding: 12px !important; }
          .buscador-btn-text { display: none !important; }
        }
      `}</style>
    </div>
  );
}
