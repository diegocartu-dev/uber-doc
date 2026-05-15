"use client";

import { useState } from "react";
import type { DatosCobertura } from "@/lib/cobertura";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type Props = {
  /** Modo "completar" = modal automático por datos faltantes.
   *  Modo "editar" = médico clickeó el lápiz, ya hay datos. */
  modo: "completar" | "editar";
  /** Datos actuales del paciente (pueden ser parciales/null) */
  datos: DatosCobertura;
  /** Nombre del paciente para mostrar en el header */
  pacienteNombre: string;
  /** Callback al confirmar — recibe los datos actualizados */
  onConfirmar: (datos: DatosCobertura) => void;
  /** Callback al cancelar/cerrar el modal */
  onCancelar: () => void;
};

// ---------------------------------------------------------------------------
// Modal de datos de cobertura del paciente
// ---------------------------------------------------------------------------

export default function ModalDatosPaciente({
  modo,
  datos,
  pacienteNombre,
  onConfirmar,
  onCancelar,
}: Props) {
  const [tieneCobertura, setTieneCobertura] = useState<boolean>(
    datos.tiene_cobertura ?? false
  );
  const [obraSocial, setObraSocial] = useState(datos.obra_social ?? "");
  const [nroAfiliado, setNroAfiliado] = useState(datos.nro_afiliado ?? "");
  const [planObraSocial, setPlanObraSocial] = useState(datos.plan_obra_social ?? "");
  const [error, setError] = useState<string | null>(null);

  function handleConfirmar() {
    // Validar si tiene cobertura que al menos tenga OOSS y Nro afiliado
    if (tieneCobertura) {
      if (!obraSocial.trim()) {
        setError("Completá el nombre de la obra social.");
        return;
      }
      if (!nroAfiliado.trim()) {
        setError("Completá el número de afiliado.");
        return;
      }
    }
    setError(null);
    onConfirmar({
      tiene_cobertura: tieneCobertura,
      obra_social: tieneCobertura ? obraSocial.trim() : null,
      nro_afiliado: tieneCobertura ? nroAfiliado.trim() : null,
      plan_obra_social: tieneCobertura ? (planObraSocial.trim() || null) : null,
    });
  }

  const titulo =
    modo === "completar"
      ? "Datos de cobertura del paciente"
      : "Editar cobertura";

  const subtitulo =
    modo === "completar"
      ? `${pacienteNombre} no tiene datos de cobertura completos. Completalos para incluirlos en la receta.`
      : pacienteNombre;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(0,0,0,0.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
      }}
    >
      <div
        style={{
          background: "white",
          borderRadius: "16px",
          padding: "24px",
          maxWidth: "420px",
          width: "100%",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        {/* Header */}
        <h3 style={{ fontSize: "16px", fontWeight: 600, color: "#111", marginBottom: "4px" }}>
          {titulo}
        </h3>
        <p style={{ fontSize: "13px", color: "#666", marginBottom: "20px" }}>
          {subtitulo}
        </p>

        {/* Toggle cobertura */}
        <div style={{ marginBottom: "16px" }}>
          <p style={{ fontSize: "12px", fontWeight: 500, color: "#888", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px" }}>
            Tipo de cobertura
          </p>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              type="button"
              onClick={() => setTieneCobertura(false)}
              style={{
                flex: 1,
                padding: "10px",
                borderRadius: "10px",
                border: `1.5px solid ${!tieneCobertura ? "#378ADD" : "#e5e7eb"}`,
                background: !tieneCobertura ? "#EBF4FF" : "white",
                color: !tieneCobertura ? "#378ADD" : "#666",
                fontSize: "14px",
                fontWeight: !tieneCobertura ? 600 : 400,
                cursor: "pointer",
                minHeight: "44px",
              }}
            >
              Particular
            </button>
            <button
              type="button"
              onClick={() => setTieneCobertura(true)}
              style={{
                flex: 1,
                padding: "10px",
                borderRadius: "10px",
                border: `1.5px solid ${tieneCobertura ? "#378ADD" : "#e5e7eb"}`,
                background: tieneCobertura ? "#EBF4FF" : "white",
                color: tieneCobertura ? "#378ADD" : "#666",
                fontSize: "14px",
                fontWeight: tieneCobertura ? 600 : 400,
                cursor: "pointer",
                minHeight: "44px",
              }}
            >
              Obra Social
            </button>
          </div>
        </div>

        {/* Campos OOSS — solo visibles si tiene cobertura */}
        {tieneCobertura && (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {/* Obra Social */}
            <div>
              <label style={{ fontSize: "12px", fontWeight: 500, color: "#888", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Obra Social *
              </label>
              <input
                type="text"
                value={obraSocial}
                onChange={(e) => { setObraSocial(e.target.value); setError(null); }}
                placeholder="OSDE, PAMI, Swiss Medical..."
                className="mt-1 w-full rounded-[10px] border border-[#e5e7eb] px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#378ADD] focus:border-[#378ADD]"
                style={{ minHeight: "44px" }}
              />
            </div>

            {/* Nro Afiliado */}
            <div>
              <label style={{ fontSize: "12px", fontWeight: 500, color: "#888", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Nº de afiliado *
              </label>
              <input
                type="text"
                value={nroAfiliado}
                onChange={(e) => { setNroAfiliado(e.target.value); setError(null); }}
                placeholder="Número de afiliado"
                className="mt-1 w-full rounded-[10px] border border-[#e5e7eb] px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#378ADD] focus:border-[#378ADD]"
                style={{ minHeight: "44px" }}
              />
            </div>

            {/* Plan */}
            <div>
              <label style={{ fontSize: "12px", fontWeight: 500, color: "#888", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Plan
              </label>
              <span style={{ fontSize: "11px", color: "#aaa", marginLeft: "6px", fontWeight: 400, textTransform: "none", letterSpacing: "0" }}>
                (obligatorio si corresponde)
              </span>
              <input
                type="text"
                value={planObraSocial}
                onChange={(e) => setPlanObraSocial(e.target.value)}
                placeholder="Plan 210, PMO, Plan A..."
                className="mt-1 w-full rounded-[10px] border border-[#e5e7eb] px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#378ADD] focus:border-[#378ADD]"
                style={{ minHeight: "44px" }}
              />
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <p style={{ fontSize: "13px", color: "#E24B4A", marginTop: "12px" }}>
            {error}
          </p>
        )}

        {/* Botones */}
        <div style={{ display: "flex", gap: "12px", marginTop: "20px" }}>
          <button
            onClick={onCancelar}
            style={{
              flex: 1,
              padding: "12px",
              borderRadius: "10px",
              border: "1px solid #e5e7eb",
              background: "white",
              fontSize: "14px",
              cursor: "pointer",
              minHeight: "44px",
            }}
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirmar}
            style={{
              flex: 1,
              padding: "12px",
              borderRadius: "10px",
              border: "none",
              background: "#378ADD",
              color: "white",
              fontSize: "14px",
              fontWeight: 500,
              cursor: "pointer",
              minHeight: "44px",
            }}
          >
            {modo === "completar" ? "Confirmar y firmar" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}
