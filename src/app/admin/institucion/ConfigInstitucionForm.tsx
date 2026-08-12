"use client";

// Editor de config de la institución — lenguaje de diseño APROBADO
// (07-handoff-claude-design: labels uppercase 11px, cards 12px, inputs
// grandes 52px con focus ring azul, botón primario 48px, espaciado en escala
// 4/8). Pantalla de Docto: el acento es el azul de acción, NUNCA --inst-*
// (identidad ≠ interacción).

import { useState } from "react";
import type { ConfigInstitucion } from "@/lib/institucional/config";
import { guardarConfigInstitucion, type ConfigInstitucionInput } from "./actions";

// Mismo placeholder que el DEFAULT de la migración 001 (⚠ placeholder legal:
// la redacción final la definen el CEO y el abogado). Solo se usa al
// provisionar (sin fila todavía); después manda lo guardado en la DB.
const EFECTOR_PLACEHOLDER =
  "Emitido a través de Docto (docto.com.ar) — plataforma de telemedicina. Matrícula del profesional verificada en REFEPS — Red Federal de Registros de Profesionales de la Salud.";

// ── Gramática visual (tokens.css del handoff) ────────────────────────────────
const ACCION = "#378ADD";
const card: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #E9EBEF",
  borderRadius: 12,
  boxShadow: "0 1px 2px rgba(16,24,40,.04)",
  padding: 20,
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
  onFocus: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    e.currentTarget.style.borderColor = ACCION;
    e.currentTarget.style.boxShadow = "0 0 0 3px rgba(55,138,221,.14)";
  },
  onBlur: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    e.currentTarget.style.borderColor = "#E5E7EB";
    e.currentTarget.style.boxShadow = "none";
  },
};

function Campo({
  titulo,
  hint,
  children,
}: {
  titulo: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <span style={label}>{titulo}</span>
      {children}
      {hint && <p style={{ marginTop: 4, fontSize: 12, color: "#9CA3AF" }}>{hint}</p>}
    </div>
  );
}

/** "08:00:00" (time de Postgres) → "08:00" (input type=time). */
function horaCorta(v: string | undefined | null, fallback: string): string {
  if (!v) return fallback;
  return v.slice(0, 5);
}

export default function ConfigInstitucionForm({ inicial }: { inicial: ConfigInstitucion | null }) {
  const [f, setF] = useState<ConfigInstitucionInput>({
    nombre: inicial?.nombre ?? "",
    subnombre: inicial?.subnombre ?? "",
    dominio: inicial?.dominio ?? "",
    color_primary: inicial?.color_primary ?? "#4A3F8C",
    color_primary_dark: inicial?.color_primary_dark ?? "#37306B",
    color_primary_soft: inicial?.color_primary_soft ?? "#EEECF7",
    pdf_efector_texto: inicial?.pdf_efector_texto ?? EFECTOR_PLACEHOLDER,
    ci_ventana_inicio: horaCorta(inicial?.ci_ventana_inicio, "08:00"),
    ci_ventana_fin: horaCorta(inicial?.ci_ventana_fin, "20:00"),
    slot_duracion_min: inicial?.slot_duracion_min ?? 15,
    especialidades: inicial?.especialidades ?? [],
    mail_from: inicial?.mail_from ?? "",
    wa_remitente_nombre: inicial?.wa_remitente_nombre ?? "",
    telefono_ayuda: inicial?.telefono_ayuda ?? "",
    precio_consulta_centavos: inicial?.precio_consulta_centavos ?? 0,
    acuerdo_horas_semana_default: inicial?.acuerdo_horas_semana_default ?? 1,
  });
  const [guardando, setGuardando] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; error?: string } | null>(null);

  const set = <K extends keyof ConfigInstitucionInput>(k: K, v: ConfigInstitucionInput[K]) =>
    setF((prev) => ({ ...prev, [k]: v }));

  async function handleGuardar(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setResultado(null);
    try {
      setResultado(await guardarConfigInstitucion(f));
    } finally {
      setGuardando(false);
    }
  }

  const colorCampo = (k: "color_primary" | "color_primary_dark" | "color_primary_soft", titulo: string) => (
    <Campo titulo={titulo}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <span
          aria-hidden
          style={{
            width: 28,
            height: 28,
            borderRadius: 6,
            border: "1px solid #E5E7EB",
            background: /^#[0-9a-fA-F]{6}$/.test(f[k]) ? f[k] : "#fff",
            flexShrink: 0,
          }}
        />
        <input
          style={{ ...inputBase, fontVariantNumeric: "tabular-nums" }}
          value={f[k]}
          onChange={(e) => set(k, e.target.value)}
          placeholder="#4A3F8C"
          {...focusRing}
        />
      </div>
    </Campo>
  );

  return (
    <form onSubmit={handleGuardar} style={{ maxWidth: 720, margin: "0 auto", padding: 24 }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, color: "#111827" }}>Institución</h1>
      <p style={{ marginTop: 4, fontSize: 13, color: "#4B5563" }}>
        Config de la marca blanca y la operación. Se aplica sin redeploy.
      </p>

      {!inicial && (
        <div
          role="alert"
          style={{
            marginTop: 16,
            padding: "10px 14px",
            borderRadius: 8,
            background: "#FEF6E8",
            color: "#BA7517",
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          Instancia sin provisionar: todavía no existe la config. Completá y guardá para crearla.
        </div>
      )}

      <div style={{ display: "grid", gap: 16, marginTop: 20 }}>
        {/* ── IDENTIDAD ── */}
        <section style={card}>
          <h2 style={{ ...label, fontSize: 12, color: "#374151", marginBottom: 16 }}>Identidad</h2>
          <div style={{ display: "grid", gap: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <Campo titulo="Nombre">
                <input style={inputBase} value={f.nombre} onChange={(e) => set("nombre", e.target.value)} placeholder="Ministerio de Salud" {...focusRing} />
              </Campo>
              <Campo titulo="Subnombre">
                <input style={inputBase} value={f.subnombre} onChange={(e) => set("subnombre", e.target.value)} placeholder="Provincia de ___" {...focusRing} />
              </Campo>
            </div>
            <Campo titulo="Dominio" hint="Alimenta links, QR de documentos y remitentes.">
              <input style={inputBase} value={f.dominio} onChange={(e) => set("dominio", e.target.value)} placeholder="salud-provincia.example" {...focusRing} />
            </Campo>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
              {colorCampo("color_primary", "Color primario")}
              {colorCampo("color_primary_dark", "Color oscuro")}
              {colorCampo("color_primary_soft", "Color suave")}
            </div>
          </div>
        </section>

        {/* ── DOCUMENTOS ── */}
        {/* Solo el texto de efector: los assets (logo, isologo, acento del
            PDF) llegan con el bucket institucion-assets en la Etapa 5. */}
        <section style={card}>
          <h2 style={{ ...label, fontSize: 12, color: "#374151", marginBottom: 16 }}>Documentos</h2>
          <Campo
            titulo="Texto de efector (pie de los PDFs)"
            hint="⚠ Placeholder legal: la redacción final la definen el CEO y el abogado. Se cambia desde acá, sin redeploy."
          >
            <textarea
              style={{ ...inputBase, height: 96, padding: "8px 12px", resize: "vertical", fontFamily: "inherit" }}
              value={f.pdf_efector_texto}
              onChange={(e) => set("pdf_efector_texto", e.target.value)}
              {...focusRing}
            />
          </Campo>
        </section>

        {/* ── OPERACIÓN ── */}
        <section style={card}>
          <h2 style={{ ...label, fontSize: 12, color: "#374151", marginBottom: 16 }}>Operación</h2>
          <div style={{ display: "grid", gap: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
              <Campo titulo="Ventana CI — desde">
                <input type="time" style={{ ...inputBase, fontVariantNumeric: "tabular-nums" }} value={f.ci_ventana_inicio} onChange={(e) => set("ci_ventana_inicio", e.target.value)} {...focusRing} />
              </Campo>
              <Campo titulo="Ventana CI — hasta">
                <input type="time" style={{ ...inputBase, fontVariantNumeric: "tabular-nums" }} value={f.ci_ventana_fin} onChange={(e) => set("ci_ventana_fin", e.target.value)} {...focusRing} />
              </Campo>
              <Campo titulo="Duración del slot" hint="En minutos. La define la institución.">
                <input
                  type="number"
                  min={5}
                  max={120}
                  style={{ ...inputBase, fontVariantNumeric: "tabular-nums" }}
                  value={f.slot_duracion_min}
                  onChange={(e) => set("slot_duracion_min", Number(e.target.value))}
                  {...focusRing}
                />
              </Campo>
            </div>
            <Campo titulo="Especialidades" hint="Una por línea. Son los chips del otorgador.">
              <textarea
                style={{ ...inputBase, height: 120, padding: "8px 12px", resize: "vertical", fontFamily: "inherit" }}
                value={f.especialidades.join("\n")}
                onChange={(e) => set("especialidades", e.target.value.split("\n"))}
                placeholder={"Clínica Médica\nPediatría\nCardiología"}
                {...focusRing}
              />
            </Campo>
          </div>
        </section>

        {/* ── COMUNICACIONES ── */}
        <section style={card}>
          <h2 style={{ ...label, fontSize: 12, color: "#374151", marginBottom: 16 }}>Comunicaciones</h2>
          <div style={{ display: "grid", gap: 16 }}>
            <Campo titulo="Remitente de mail" hint="Dominio verificado en Resend.">
              <input style={inputBase} value={f.mail_from} onChange={(e) => set("mail_from", e.target.value)} placeholder="Salud Provincia de ___ <no-reply@salud-provincia.example>" {...focusRing} />
            </Campo>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <Campo titulo="Remitente de WhatsApp">
                <input style={inputBase} value={f.wa_remitente_nombre} onChange={(e) => set("wa_remitente_nombre", e.target.value)} placeholder="Salud Provincia de ___" {...focusRing} />
              </Campo>
              <Campo titulo="Teléfono de ayuda">
                <input style={{ ...inputBase, fontVariantNumeric: "tabular-nums" }} value={f.telefono_ayuda} onChange={(e) => set("telefono_ayuda", e.target.value)} placeholder="0800-555-0000" {...focusRing} />
              </Campo>
            </div>
          </div>
        </section>

        {/* ── COMERCIAL — solo esta pantalla ── */}
        <section style={{ ...card, borderColor: "#E8C98A" }}>
          <h2 style={{ ...label, fontSize: 12, color: "#374151", marginBottom: 4 }}>Comercial</h2>
          <p style={{ fontSize: 12, color: "#BA7517", fontWeight: 500, marginBottom: 16 }}>
            Visible SOLO en este panel. Nunca lo ven operadores, profesionales ni pacientes.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <Campo
              titulo="Precio por consulta (centavos)"
              hint={
                Number.isInteger(f.precio_consulta_centavos) && f.precio_consulta_centavos > 0
                  ? `= $ ${(f.precio_consulta_centavos / 100).toLocaleString("es-AR")} por consulta facturable`
                  : "Metering → factura mensual."
              }
            >
              <input
                type="number"
                min={0}
                style={{ ...inputBase, fontVariantNumeric: "tabular-nums" }}
                value={f.precio_consulta_centavos}
                onChange={(e) => set("precio_consulta_centavos", Number(e.target.value))}
                {...focusRing}
              />
            </Campo>
            <Campo titulo="Acuerdo default (hs/semana)" hint="Default de los acuerdos de servicio por profesional.">
              <input
                type="number"
                min={0.5}
                step={0.5}
                style={{ ...inputBase, fontVariantNumeric: "tabular-nums" }}
                value={f.acuerdo_horas_semana_default}
                onChange={(e) => set("acuerdo_horas_semana_default", Number(e.target.value))}
                {...focusRing}
              />
            </Campo>
          </div>
        </section>
      </div>

      {resultado && (
        <div
          role="alert"
          style={{
            marginTop: 16,
            padding: "10px 14px",
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 500,
            background: resultado.ok ? "#E8F5F0" : "#FDF0F0",
            color: resultado.ok ? "#1D9E75" : "#E24B4A",
          }}
        >
          {resultado.ok ? "Config guardada." : resultado.error}
        </div>
      )}

      <button
        type="submit"
        disabled={guardando}
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
          cursor: guardando ? "default" : "pointer",
          opacity: guardando ? 0.6 : 1,
        }}
      >
        {guardando ? "Guardando…" : inicial ? "Guardar cambios" : "Provisionar instancia"}
      </button>
    </form>
  );
}
