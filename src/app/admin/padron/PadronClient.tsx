"use client";

// Import de padrón por CSV — lenguaje de diseño APROBADO (07-handoff, mismo
// vocabulario que OperadoresClient): labels uppercase 11px, cards 12px, focus
// ring azul, botón primario 48px, dialogs React inline (JAMÁS window.confirm).
//
// Flujo en dos fases (regla del ticket): el archivo se PREVISUALIZA (filas
// OK/error) ANTES de ejecutar, y al terminar se muestra el reporte.

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  previsualizarPadron,
  ejecutarImportPadron,
  type PreviewImport,
  type ReporteImport,
} from "./actions";

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
  height: 48,
  padding: "0 20px",
  border: "1px solid #D1D5DB",
  borderRadius: 8,
  background: "#fff",
  color: "#111827",
  fontSize: 14,
  fontWeight: 500,
  cursor: "pointer",
};

export default function PadronClient({ totalPadron }: { totalPadron: number }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [archivo, setArchivo] = useState<{ nombre: string; texto: string } | null>(null);
  const [preview, setPreview] = useState<PreviewImport | null>(null);
  const [reporte, setReporte] = useState<ReporteImport | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [cargando, setCargando] = useState<"preview" | "import" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function elegirArchivo(f: File) {
    setError(null);
    setReporte(null);
    setPreview(null);
    const texto = await f.text();
    setArchivo({ nombre: f.name, texto });
    setCargando("preview");
    try {
      const p = await previsualizarPadron(texto);
      if (!p.ok) setError(p.error ?? "No se pudo leer el archivo.");
      else setPreview(p);
    } catch {
      setError("No se pudo procesar el archivo. Probá de nuevo.");
    } finally {
      setCargando(null);
    }
  }

  async function ejecutar() {
    if (!archivo) return;
    setConfirmando(false);
    setCargando("import");
    setError(null);
    try {
      const r = await ejecutarImportPadron(archivo.texto, archivo.nombre);
      if (!r.ok) setError(r.error ?? "El import falló.");
      else {
        setReporte(r);
        setPreview(null);
        setArchivo(null);
        if (fileRef.current) fileRef.current.value = "";
        router.refresh();
      }
    } catch {
      setError("El import falló a mitad de camino. Revisá el padrón antes de reintentar: las filas ya procesadas no se duplican (el alta es idempotente por DNI).");
    } finally {
      setCargando(null);
    }
  }

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "24px 24px 48px", display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <h1 style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-.01em", color: "#111827" }}>Padrón de pacientes</h1>
        <p style={{ fontSize: 13, color: "#4B5563", marginTop: 4 }}>
          Alta provisionada por archivo. Hoy el padrón tiene <b>{totalPadron}</b> paciente{totalPadron === 1 ? "" : "s"}.
          Re-importar no duplica: si el DNI ya existe, solo se actualiza su contacto.
        </p>
      </div>

      {/* Selección de archivo */}
      <section style={{ ...card, padding: "16px 20px" }}>
        <span style={label}>Archivo CSV</span>
        <p style={{ fontSize: 13, color: "#4B5563", margin: "0 0 12px" }}>
          Header esperado: <code style={{ fontSize: 12, background: "#F3F4F6", padding: "2px 6px", borderRadius: 4 }}>dni,nombre,fecha_nacimiento,sexo,localidad,celular,email</code>{" "}
          (orden libre; sexo M/F; fechas AAAA-MM-DD).
        </p>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv,text/plain"
          style={{ fontSize: 14 }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void elegirArchivo(f);
          }}
        />
        {cargando === "preview" && (
          <p style={{ fontSize: 13, color: "#4B5563", marginTop: 10 }}>Leyendo el archivo…</p>
        )}
      </section>

      {error && (
        <div style={{ ...card, padding: "12px 16px", borderColor: "#F3C9B8", background: "#FDF1EC", color: "#D85A30", fontSize: 13, fontWeight: 500 }}>
          {error}
        </div>
      )}

      {/* Preview */}
      {preview && (
        <section style={{ ...card, padding: "16px 20px" }}>
          <span style={label}>Antes de importar — revisá</span>
          <p style={{ fontSize: 14, color: "#111827", margin: "0 0 12px" }}>
            {preview.total} filas: <b style={{ color: "#1D9E75" }}>{preview.validas} listas</b>
            {preview.invalidas > 0 && (
              <> · <b style={{ color: "#D85A30" }}>{preview.invalidas} con error</b> (se saltean; corregilas y re-importá el archivo cuando quieras)</>
            )}
          </p>
          <div style={{ maxHeight: 320, overflowY: "auto", border: "1px solid #F1F3F4", borderRadius: 8 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <tbody>
                {preview.filas.map((f) => (
                  <tr key={f.linea} style={{ borderBottom: "1px solid #F1F3F4" }}>
                    <td style={{ padding: "8px 12px", color: "#9CA3AF", width: 64, fontVariantNumeric: "tabular-nums" }}>L{f.linea}</td>
                    <td style={{ padding: "8px 12px" }}>
                      {f.ok ? (
                        <span style={{ color: "#111827" }}>{f.resumen}</span>
                      ) : (
                        <span style={{ color: "#D85A30" }}>{f.error}</span>
                      )}
                    </td>
                    <td style={{ padding: "8px 12px", width: 90, textAlign: "right" }}>
                      <span style={{ display: "inline-block", padding: "2px 10px", borderRadius: 99, fontSize: 12, fontWeight: 600, background: f.ok ? "#E8F5F0" : "#FDF1EC", color: f.ok ? "#1D9E75" : "#D85A30" }}>
                        {f.ok ? "Lista" : "Error"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.validas > 50 && (
            <p style={{ fontSize: 12, color: "#9CA3AF", marginTop: 8 }}>
              Se muestran las primeras 50 filas válidas (los errores se listan todos).
            </p>
          )}
          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <button
              style={{ ...btnPrimario, ...(preview.validas === 0 ? { background: "#D1D5DB", cursor: "default" } : {}) }}
              disabled={preview.validas === 0 || cargando !== null}
              onClick={() => setConfirmando(true)}
            >
              Importar {preview.validas} paciente{preview.validas === 1 ? "" : "s"}
            </button>
            <button
              style={btnSec}
              onClick={() => {
                setPreview(null);
                setArchivo(null);
                if (fileRef.current) fileRef.current.value = "";
              }}
            >
              Descartar
            </button>
          </div>
        </section>
      )}

      {/* Reporte */}
      {reporte && (
        <section style={{ ...card, padding: "16px 20px" }}>
          <span style={label}>Import terminado</span>
          <p style={{ fontSize: 14, color: "#111827", margin: 0 }}>
            <b style={{ color: "#1D9E75" }}>{reporte.creados} creados</b> · {reporte.actualizados} actualizados
            {reporte.salteados > 0 && <> · {reporte.salteados} salteados por error de formato</>}
            {reporte.fallidos.length > 0 && (
              <> · <b style={{ color: "#D85A30" }}>{reporte.fallidos.length} fallidos</b></>
            )}
          </p>
          {reporte.fallidos.length > 0 && (
            <ul style={{ margin: "10px 0 0", paddingLeft: 18, fontSize: 13, color: "#D85A30" }}>
              {reporte.fallidos.map((f) => (
                <li key={f.linea}>Línea {f.linea}: {f.error}</li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* Dialog de confirmación — React inline, jamás window.confirm */}
      {confirmando && preview && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(16,24,40,.4)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ ...card, maxWidth: 440, width: "100%", padding: "24px 24px 20px" }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: "#111827", margin: 0 }}>
              ¿Importar {preview.validas} paciente{preview.validas === 1 ? "" : "s"} al padrón?
            </h2>
            <p style={{ fontSize: 13, color: "#4B5563", margin: "8px 0 0" }}>
              Se crean las cuentas de acceso (sin contraseña) y las fichas del padrón.
              Los DNI que ya existan solo actualizan su contacto.
              {preview.invalidas > 0 && ` Las ${preview.invalidas} filas con error se saltean.`}
            </p>
            <div style={{ display: "flex", gap: 10, marginTop: 18, justifyContent: "flex-end" }}>
              <button style={btnSec} onClick={() => setConfirmando(false)}>Cancelar</button>
              <button style={btnPrimario} onClick={() => void ejecutar()} disabled={cargando !== null}>
                {cargando === "import" ? "Importando…" : "Sí, importar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {cargando === "import" && !confirmando && (
        <p style={{ fontSize: 13, color: "#4B5563" }}>Importando… no cierres esta pestaña.</p>
      )}
    </div>
  );
}
