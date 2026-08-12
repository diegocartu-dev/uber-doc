"use client";

// Carga de agendas ACORDADAS — lenguaje de diseño APROBADO (07-handoff, mismo
// vocabulario que OperadoresClient/PadronClient): labels uppercase 11px, cards
// 12px, focus ring azul, botón primario 48px, dialogs React inline.
//
// La duración del slot NO se elige acá: la define la config de la institución
// y se muestra como dato (decisión 12/08 — "quien levanta las agendas es la
// institución", pero la duración es política de la instancia, no del form).

import { useState } from "react";
import { useRouter } from "next/navigation";
import { crearAgendaAcordada, desactivarAgenda } from "./actions";
import type { Franja } from "@/lib/agenda/crear-agenda";

export interface MedicoOpcion {
  id: string;
  nombre: string;
  especialidad: string;
  conFirma: boolean;
}

export interface AgendaFila {
  id: string;
  medicoNombre: string;
  nombre: string;
  fechaInicio: string;
  fechaFin: string;
  canal: "acordado" | "ofrecido";
  activo: boolean;
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
const btnPrimario: React.CSSProperties = {
  height: 48,
  padding: "0 24px",
  border: "none",
  borderRadius: 8,
  background: ACCION,
  color: "#fff",
  fontSize: 14,
  fontWeight: 500,
  cursor: "pointer",
};
const btnSec: React.CSSProperties = {
  height: 40,
  padding: "0 14px",
  border: "1px solid #D1D5DB",
  borderRadius: 8,
  background: "#fff",
  color: "#111827",
  fontSize: 13,
  fontWeight: 500,
  cursor: "pointer",
};

const DIAS = [
  { v: 1, l: "Lun" },
  { v: 2, l: "Mar" },
  { v: 3, l: "Mié" },
  { v: 4, l: "Jue" },
  { v: 5, l: "Vie" },
  { v: 6, l: "Sáb" },
  { v: 7, l: "Dom" },
];

type FranjaForm = { dia_semana: number; hora_inicio: string; hora_fin: string };

export default function AgendasClient({
  medicos,
  agendas,
  slotDuracionMin,
}: {
  medicos: MedicoOpcion[];
  agendas: AgendaFila[];
  slotDuracionMin: number;
}) {
  const router = useRouter();
  const [medicoId, setMedicoId] = useState("");
  const [nombre, setNombre] = useState("");
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");
  const [franjas, setFranjas] = useState<FranjaForm[]>([
    { dia_semana: 1, hora_inicio: "09:00", hora_fin: "12:00" },
  ]);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);
  const [bajaPendiente, setBajaPendiente] = useState<AgendaFila | null>(null);

  const medicoSel = medicos.find((m) => m.id === medicoId) ?? null;

  async function crear() {
    setError(null);
    setExito(null);
    if (!medicoId) return setError("Elegí un profesional.");
    if (!nombre.trim()) return setError("Poné un nombre a la agenda (ej: \"Agenda semanal — octubre\").");
    if (!fechaInicio || !fechaFin) return setError("Completá el rango de fechas.");
    setEnviando(true);
    try {
      const res = await crearAgendaAcordada({
        medicoId,
        nombre: nombre.trim(),
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin,
        franjas: franjas as Franja[],
      });
      if (!res.ok) setError(res.error ?? "No se pudo crear la agenda.");
      else {
        setExito(`Agenda creada: ${res.turnosCreados ?? 0} lugares generados (slots de ${slotDuracionMin} min).`);
        setNombre("");
        router.refresh();
      }
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "24px 24px 48px", display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <h1 style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-.01em", color: "#111827" }}>Agendas institucionales</h1>
        <p style={{ fontSize: 13, color: "#4B5563", marginTop: 4 }}>
          El motor <b>acordado</b>: la institución levanta la agenda del profesional y el turnero la llena.
          Duración de consulta de esta institución: <b>{slotDuracionMin} minutos</b> (se configura en Institución, no acá).
        </p>
      </div>

      {/* Alta */}
      <section style={{ ...card, padding: "16px 20px" }}>
        <span style={label}>Nueva agenda acordada</span>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <span style={label}>Profesional</span>
            <select style={inputBase} value={medicoId} onChange={(e) => setMedicoId(e.target.value)} {...focusRing}>
              <option value="">Elegí un profesional…</option>
              {medicos.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nombre} — {m.especialidad}{m.conFirma ? "" : " (sin firma)"}
                </option>
              ))}
            </select>
            {medicoSel && !medicoSel.conFirma && (
              <p style={{ fontSize: 12, color: "#BA7517", marginTop: 6 }}>
                Sin firma configurada: la agenda va a rechazarse hasta que el profesional la configure.
              </p>
            )}
          </div>
          <div>
            <span style={label}>Nombre de la agenda</span>
            <input style={inputBase} value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Agenda semanal" {...focusRing} />
          </div>
          <div>
            <span style={label}>Desde</span>
            <input type="date" style={inputBase} value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} {...focusRing} />
          </div>
          <div>
            <span style={label}>Hasta (máx. 60 días)</span>
            <input type="date" style={inputBase} value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} {...focusRing} />
          </div>
        </div>

        <div style={{ marginTop: 16 }}>
          <span style={label}>Franjas semanales</span>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {franjas.map((f, i) => (
              <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <select
                  style={{ ...inputBase, width: 120, height: 40 }}
                  value={f.dia_semana}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setFranjas((fs) => fs.map((x, j) => (j === i ? { ...x, dia_semana: v } : x)));
                  }}
                  {...focusRing}
                >
                  {DIAS.map((d) => (
                    <option key={d.v} value={d.v}>{d.l}</option>
                  ))}
                </select>
                <input
                  type="time"
                  style={{ ...inputBase, width: 130, height: 40 }}
                  value={f.hora_inicio}
                  onChange={(e) => setFranjas((fs) => fs.map((x, j) => (j === i ? { ...x, hora_inicio: e.target.value } : x)))}
                  {...focusRing}
                />
                <span style={{ color: "#9CA3AF", fontSize: 13 }}>a</span>
                <input
                  type="time"
                  style={{ ...inputBase, width: 130, height: 40 }}
                  value={f.hora_fin}
                  onChange={(e) => setFranjas((fs) => fs.map((x, j) => (j === i ? { ...x, hora_fin: e.target.value } : x)))}
                  {...focusRing}
                />
                {franjas.length > 1 && (
                  <button style={btnSec} onClick={() => setFranjas((fs) => fs.filter((_, j) => j !== i))}>
                    Quitar
                  </button>
                )}
              </div>
            ))}
          </div>
          <button
            style={{ ...btnSec, marginTop: 8 }}
            onClick={() => setFranjas((fs) => [...fs, { dia_semana: 1, hora_inicio: "09:00", hora_fin: "12:00" }])}
          >
            ＋ Agregar franja
          </button>
        </div>

        {error && <p style={{ fontSize: 13, color: "#D85A30", fontWeight: 500, marginTop: 12 }}>{error}</p>}
        {exito && <p style={{ fontSize: 13, color: "#1D9E75", fontWeight: 500, marginTop: 12 }}>{exito}</p>}

        <div style={{ marginTop: 16 }}>
          <button style={{ ...btnPrimario, opacity: enviando ? 0.6 : 1 }} disabled={enviando} onClick={() => void crear()}>
            {enviando ? "Creando…" : "Crear agenda acordada"}
          </button>
        </div>
      </section>

      {/* Listado */}
      <section style={{ ...card, padding: "16px 20px" }}>
        <span style={label}>Agendas cargadas</span>
        {agendas.length === 0 ? (
          <p style={{ fontSize: 13, color: "#4B5563" }}>Todavía no hay agendas institucionales.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <tbody>
              {agendas.map((a) => (
                <tr key={a.id} style={{ borderBottom: "1px solid #F1F3F4" }}>
                  <td style={{ padding: "10px 8px", fontWeight: 600, color: "#111827" }}>{a.medicoNombre}</td>
                  <td style={{ padding: "10px 8px", color: "#4B5563" }}>{a.nombre}</td>
                  <td style={{ padding: "10px 8px", color: "#4B5563", fontVariantNumeric: "tabular-nums" }}>
                    {a.fechaInicio} → {a.fechaFin}
                  </td>
                  <td style={{ padding: "10px 8px" }}>
                    <span style={{ display: "inline-block", padding: "2px 10px", borderRadius: 99, fontSize: 12, fontWeight: 600, background: "#EBF3FC", color: "#2D75C4" }}>
                      {a.canal === "acordado" ? "Acordado" : "Ofrecido"}
                    </span>
                  </td>
                  <td style={{ padding: "10px 8px" }}>
                    <span style={{ display: "inline-block", padding: "2px 10px", borderRadius: 99, fontSize: 12, fontWeight: 600, background: a.activo ? "#E8F5F0" : "#F4F4F3", color: a.activo ? "#1D9E75" : "#888780" }}>
                      {a.activo ? "Activa" : "Inactiva"}
                    </span>
                  </td>
                  <td style={{ padding: "10px 8px", textAlign: "right" }}>
                    {a.activo && (
                      <button style={btnSec} onClick={() => setBajaPendiente(a)}>Desactivar</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Dialog de baja — React inline, jamás window.confirm */}
      {bajaPendiente && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(16,24,40,.4)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ ...card, maxWidth: 440, width: "100%", padding: "24px 24px 20px" }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: "#111827", margin: 0 }}>
              ¿Desactivar la agenda de {bajaPendiente.medicoNombre}?
            </h2>
            <p style={{ fontSize: 13, color: "#4B5563", margin: "8px 0 0" }}>
              Se bloquean los lugares libres que quedaban. Los turnos ya asignados a pacientes NO se tocan:
              reasignarlos es una reprogramación y se hace desde el turnero.
            </p>
            <div style={{ display: "flex", gap: 10, marginTop: 18, justifyContent: "flex-end" }}>
              <button style={btnSec} onClick={() => setBajaPendiente(null)}>Cancelar</button>
              <button
                style={{ ...btnPrimario, background: "#E24B4A" }}
                onClick={async () => {
                  const res = await desactivarAgenda(bajaPendiente.id);
                  setBajaPendiente(null);
                  if (!res.ok) setError(res.error ?? "No se pudo desactivar.");
                  else router.refresh();
                }}
              >
                Sí, desactivar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
