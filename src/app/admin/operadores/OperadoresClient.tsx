"use client";

// Gestión de operadores — lenguaje de diseño APROBADO (07-handoff): labels
// uppercase 11px, cards 12px, inputs grandes 52px, filas en grilla estricta,
// badges soft con semántica fija (verde = activo, gris = inactivo), focus
// ring azul, botón primario 48px, espaciado en escala 4/8. Acento = azul de
// acción; --inst-* jamás en controles.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { crearOperador, setOperadorActivo } from "./actions";

export interface OperadorFila {
  id: string;
  nombre: string;
  tipo: "humano" | "ia";
  nivel: "otorgador" | "admin_institucion";
  activo: boolean;
  email: string | null;
}

const ACCION = "#378ADD";
const card: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #E9EBEF",
  borderRadius: 12,
  boxShadow: "0 1px 2px rgba(16,24,40,.04)",
};
const label: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: ".06em",
  textTransform: "uppercase",
  color: "#9CA3AF",
  marginBottom: 8,
};
// "Input grande" del handoff: 52 de alto (40 es la altura del botón compacto,
// no de un input — nada fuera de la escala aprobada).
const inputBase: React.CSSProperties = {
  width: "100%",
  height: 52,
  padding: "0 12px",
  fontSize: 14,
  color: "#111827",
  background: "#fff",
  border: "1px solid #E5E7EB",
  borderRadius: 8,
  outline: "none",
};
const focusRing = {
  onFocus: (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
    e.currentTarget.style.borderColor = ACCION;
    e.currentTarget.style.boxShadow = "0 0 0 3px rgba(55,138,221,.14)";
  },
  onBlur: (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
    e.currentTarget.style.borderColor = "#E5E7EB";
    e.currentTarget.style.boxShadow = "none";
  },
};

const NIVEL_LABEL: Record<OperadorFila["nivel"], string> = {
  otorgador: "Otorgador",
  admin_institucion: "Admin institución",
};

function BadgeEstado({ activo }: { activo: boolean }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 10px",
        borderRadius: 99,
        fontSize: 12,
        fontWeight: 600,
        background: activo ? "#E8F5F0" : "#F4F4F3",
        color: activo ? "#1D9E75" : "#888780",
      }}
    >
      {activo ? "Activo" : "Inactivo"}
    </span>
  );
}

// Grilla estricta compartida entre header y filas (patrón mock 04).
const GRILLA = "1.4fr 1.6fr 150px 90px 90px 110px";

export default function OperadoresClient({ operadores }: { operadores: OperadorFila[] }) {
  const router = useRouter();
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [nivel, setNivel] = useState<OperadorFila["nivel"]>("otorgador");
  const [tipo, setTipo] = useState<OperadorFila["tipo"]>("humano");
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  async function handleCrear(e: React.FormEvent) {
    e.preventDefault();
    setCreando(true);
    setError(null);
    try {
      const r = await crearOperador({ nombre, nivel, tipo, email });
      if (!r.ok) {
        setError(r.error ?? "No se pudo crear.");
        return;
      }
      setNombre("");
      setEmail("");
      router.refresh();
    } finally {
      setCreando(false);
    }
  }

  async function handleToggle(op: OperadorFila) {
    setTogglingId(op.id);
    setError(null);
    try {
      const r = await setOperadorActivo(op.id, !op.activo);
      if (!r.ok) setError(r.error ?? "No se pudo actualizar.");
      router.refresh();
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <div style={{ maxWidth: 880, margin: "0 auto", padding: 24 }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, color: "#111827" }}>Operadores</h1>
      <p style={{ marginTop: 4, fontSize: 13, color: "#4B5563" }}>
        Quiénes operan por la institución: otorgadores y admins del panel. La baja
        desactiva (la fila queda para auditoría), no borra.
      </p>

      {/* ── Alta ── */}
      <form onSubmit={handleCrear} style={{ ...card, padding: 20, marginTop: 20 }}>
        <h2 style={{ ...label, fontSize: 12, color: "#374151", marginBottom: 16 }}>Nuevo operador</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1.4fr 1fr 1fr", gap: 12 }}>
          <div>
            <span style={label}>Nombre</span>
            <input style={inputBase} value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Claudia Romero" {...focusRing} />
          </div>
          <div>
            <span style={label}>Email {tipo === "ia" && "(no aplica)"}</span>
            <input
              style={{ ...inputBase, opacity: tipo === "ia" ? 0.5 : 1 }}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="operadora@salud-provincia.example"
              disabled={tipo === "ia"}
              {...focusRing}
            />
          </div>
          <div>
            <span style={label}>Rol</span>
            <select style={inputBase} value={nivel} onChange={(e) => setNivel(e.target.value as OperadorFila["nivel"])} {...focusRing}>
              <option value="otorgador">Otorgador</option>
              <option value="admin_institucion">Admin institución</option>
            </select>
          </div>
          <div>
            <span style={label}>Tipo</span>
            <select style={inputBase} value={tipo} onChange={(e) => setTipo(e.target.value as OperadorFila["tipo"])} {...focusRing}>
              <option value="humano">Humano</option>
              <option value="ia">IA (vía API key)</option>
            </select>
          </div>
        </div>
        {tipo === "humano" && (
          <p style={{ marginTop: 8, fontSize: 12, color: "#9CA3AF" }}>
            El operador humano necesita cuenta creada antes del alta; entra por el login común.
          </p>
        )}
        {tipo === "ia" && (
          <p style={{ marginTop: 8, fontSize: 12, color: "#9CA3AF" }}>
            La API key del operador IA se gestiona con la API de asignación (próxima etapa).
          </p>
        )}
        {error && (
          <div role="alert" style={{ marginTop: 12, padding: "10px 14px", borderRadius: 8, background: "#FDF0F0", color: "#E24B4A", fontSize: 13, fontWeight: 500 }}>
            {error}
          </div>
        )}
        <button
          type="submit"
          disabled={creando}
          style={{
            marginTop: 16,
            height: 48,
            padding: "0 32px",
            borderRadius: 8,
            border: "none",
            background: ACCION,
            color: "#fff",
            fontSize: 14,
            fontWeight: 600,
            cursor: creando ? "default" : "pointer",
            opacity: creando ? 0.6 : 1,
          }}
        >
          {creando ? "Creando…" : "Dar de alta"}
        </button>
      </form>

      {/* ── Lista ── */}
      <div style={{ ...card, marginTop: 16, overflow: "hidden" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: GRILLA,
            gap: 12,
            padding: "10px 20px",
            borderBottom: "1px solid #F1F3F4",
          }}
        >
          <span style={{ ...label, marginBottom: 0 }}>Nombre</span>
          <span style={{ ...label, marginBottom: 0 }}>Email</span>
          <span style={{ ...label, marginBottom: 0 }}>Rol</span>
          <span style={{ ...label, marginBottom: 0 }}>Tipo</span>
          <span style={{ ...label, marginBottom: 0 }}>Estado</span>
          <span style={{ ...label, marginBottom: 0 }} />
        </div>
        {operadores.length === 0 && (
          <p style={{ padding: "20px", fontSize: 13, color: "#9CA3AF" }}>
            Todavía no hay operadores. El primero suele ser quien atiende el 0800.
          </p>
        )}
        {operadores.map((op) => (
          <div
            key={op.id}
            style={{
              display: "grid",
              gridTemplateColumns: GRILLA,
              gap: 12,
              alignItems: "center",
              minHeight: 56,
              padding: "8px 20px",
              borderBottom: "1px solid #F1F3F4",
              opacity: op.activo ? 1 : 0.65,
            }}
          >
            <span style={{ fontSize: 14, fontWeight: 500, color: "#111827" }}>{op.nombre}</span>
            <span style={{ fontSize: 13, color: "#4B5563", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {op.email ?? "—"}
            </span>
            <span style={{ fontSize: 13, color: "#4B5563" }}>{NIVEL_LABEL[op.nivel]}</span>
            <span style={{ fontSize: 13, color: "#4B5563" }}>{op.tipo === "ia" ? "IA" : "Humano"}</span>
            <BadgeEstado activo={op.activo} />
            <button
              type="button"
              onClick={() => handleToggle(op)}
              disabled={togglingId === op.id}
              style={{
                height: 32,
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 500,
                cursor: togglingId === op.id ? "default" : "pointer",
                background: "transparent",
                border: op.activo ? "1px solid #E24B4A" : `1px solid ${ACCION}`,
                color: op.activo ? "#E24B4A" : ACCION,
                opacity: togglingId === op.id ? 0.5 : 1,
              }}
            >
              {op.activo ? "Dar de baja" : "Reactivar"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
