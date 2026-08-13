"use client";

// /admin/periodos — mirar un mes ya facturado y, si hace falta, corregirlo
// dejando constancia (R33). Mismo lenguaje de diseño que el resto del /admin
// institucional (07-handoff): labels uppercase 11px, cards 12px, inputs de 52,
// badges soft, acento azul de acción.
//
// Dos decisiones de esta pantalla:
//   · el motivo es un campo, no un `confirm()`. La regla pide una explicación
//     que se pueda leer dentro de dos años, y además los diálogos nativos se
//     suprimen solos en páginas con iframes (CLAUDE.md).
//   · la fila corregida NO se esconde ni se pinta de rojo: se marca. Lo que la
//     auditoría necesita es poder ver qué se tocó, no que desaparezca.

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CLASIFICACIONES,
  ETIQUETA_CLASIFICACION,
  MOTIVO_MIN,
  etiquetaPeriodo,
  validarCorreccion,
  type Clasificacion,
  type CorreccionRegistrada,
  type EncuentroSellado,
} from "@/lib/metering/correcciones";
import { corregirClasificacionSellada } from "./actions";

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

const GRILLA = "96px 1.6fr 1.2fr 150px 120px";

function Badge({ texto, tono }: { texto: string; tono: "verde" | "gris" | "amarillo" | "naranja" }) {
  const colores = {
    verde: { background: "#E8F5F0", color: "#1D9E75" },
    gris: { background: "#F4F4F3", color: "#888780" },
    amarillo: { background: "#FBF3E4", color: "#BA7517" },
    naranja: { background: "#FBEDE7", color: "#D85A30" },
  }[tono];
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 10px",
        borderRadius: 99,
        fontSize: 12,
        fontWeight: 600,
        ...colores,
      }}
    >
      {texto}
    </span>
  );
}

function fechaCorta(iso: string): string {
  return new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  });
}

function momento(iso: string): string {
  return new Date(iso).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });
}

interface Props {
  periodo: string;
  periodos: string[];
  encuentros: EncuentroSellado[];
  historial: CorreccionRegistrada[];
  esSuperadmin: boolean;
}

export default function PeriodosClient({ periodo, periodos, encuentros, historial, esSuperadmin }: Props) {
  const router = useRouter();
  const [abierto, setAbierto] = useState<string | null>(null);
  const [clasificacion, setClasificacion] = useState<Clasificacion>("no_facturable_corta");
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const selladas = encuentros.filter((e) => !e.llego_tarde);
  const tarde = encuentros.filter((e) => e.llego_tarde);
  // Lo facturable se cuenta sobre lo SELLADO: es lo que dice la factura que se
  // emitió. Una fila que llegó después del cierre no entró a ese número.
  const facturables = selladas.filter((e) => e.clasificacion === "facturable").length;

  function abrir(e: EncuentroSellado) {
    setAbierto(e.id);
    setClasificacion(
      e.clasificacion === "facturable" ? "no_facturable_corta" : "facturable"
    );
    setMotivo("");
    setError(null);
  }

  async function guardar(e: EncuentroSellado) {
    const validado = validarCorreccion({ clasificacion, motivo, actual: e.clasificacion });
    if (!validado.ok) {
      setError(validado.error);
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      const r = await corregirClasificacionSellada({
        encuentroId: e.id,
        clasificacion,
        motivo,
        actual: e.clasificacion,
        periodo,
      });
      if (!r.ok) {
        setError(r.error ?? "No se pudo aplicar la corrección.");
        return;
      }
      setAbierto(null);
      setMotivo("");
      router.refresh();
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div style={{ maxWidth: 980, margin: "0 auto", padding: 24 }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, color: "#111827" }}>Períodos facturados</h1>
      <p style={{ marginTop: 4, fontSize: 13, color: "#4B5563" }}>
        Un mes cerrado es inmutable: ni el contador, ni un backfill, ni la institución pueden
        moverlo. Solo un superadministrador de Docto puede corregir una clasificación, con
        motivo, y cada corrección queda registrada como parte de la auditoría del período.
      </p>

      {/* ── Selector de mes ── */}
      <div style={{ ...card, padding: 20, marginTop: 20 }}>
        <span style={label}>Mes cerrado</span>
        {periodos.length === 0 ? (
          <p style={{ fontSize: 13, color: "#6B7280", margin: 0 }}>
            Todavía no hay ningún mes cerrado. El cierre lo hace solo la tarea automática del
            día 1; si hace falta correrlo a mano, está el runbook del cierre mensual.
          </p>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <select
              style={{ ...inputBase, width: 220 }}
              value={periodo}
              onChange={(ev) => router.push(`/admin/periodos?periodo=${ev.target.value}`)}
            >
              {periodos.map((p) => (
                <option key={p} value={p}>
                  {etiquetaPeriodo(p)}
                </option>
              ))}
            </select>
            <span style={{ fontSize: 13, color: "#4B5563" }}>
              {selladas.length} consulta{selladas.length === 1 ? "" : "s"} sellada
              {selladas.length === 1 ? "" : "s"} · <b>{facturables} facturable
              {facturables === 1 ? "" : "s"}</b>
              {historial.length > 0 && ` · ${historial.length} corrección${historial.length === 1 ? "" : "es"}`}
            </span>
          </div>
        )}
      </div>

      {/* ── Las que llegaron tarde: lo único de este mes que NO está congelado ── */}
      {tarde.length > 0 && (
        <div
          style={{
            ...card,
            padding: 16,
            marginTop: 20,
            borderColor: "#F0D6C8",
            background: "#FEF8F5",
            fontSize: 13,
            color: "#4B5563",
            lineHeight: 1.5,
          }}
        >
          {/* Una sola expresión por frase: partir el plural en dos llaves entre
              líneas mete un espacio de JSX en el medio y se leía "llegó aron". */}
          <b style={{ color: "#D85A30" }}>
            {tarde.length === 1
              ? "1 consulta de este mes llegó después del cierre."
              : `${tarde.length} consultas de este mes llegaron después del cierre.`}
          </b>{" "}
          {tarde.length === 1 ? "Apareció" : "Aparecieron"} en el contador cuando el mes ya
          estaba sellado, así que{" "}
          <b>no entraron a la factura que se emitió</b> y no están congeladas. Tampoco se
          pueden corregir desde acá: la puerta auditada es solo para filas selladas. Si
          corresponde cobrarlas, se decide a mano y se factura aparte.
        </div>
      )}

      {/* ── El detalle sellado ── */}
      {encuentros.length > 0 && (
        <div style={{ ...card, marginTop: 20, overflow: "hidden" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: GRILLA,
              gap: 12,
              padding: "12px 20px",
              borderBottom: "1px solid #F1F2F4",
              ...label,
              marginBottom: 0,
            }}
          >
            <span>Fecha</span>
            <span>Profesional</span>
            <span>Clasificación</span>
            <span>Detalle</span>
            <span />
          </div>

          {encuentros.map((e) => (
            <div key={e.id} style={{ borderBottom: "1px solid #F1F2F4" }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: GRILLA,
                  gap: 12,
                  padding: "14px 20px",
                  alignItems: "center",
                  fontSize: 13,
                  color: "#111827",
                }}
              >
                <span>{fechaCorta(e.fecha_ar)}</span>
                <span>
                  {e.profesional}
                  <span style={{ color: "#9CA3AF" }}>
                    {" "}
                    · {e.tipo === "turno" ? "Turno" : "Consulta inmediata"}
                  </span>
                </span>
                <span>
                  <Badge
                    texto={ETIQUETA_CLASIFICACION[e.clasificacion]}
                    tono={e.clasificacion === "facturable" ? "verde" : "gris"}
                  />
                </span>
                <span style={{ color: "#6B7280" }}>
                  {e.segundos_ambos_en_sala}s · {e.documentos_emitidos} doc
                  {e.correcciones > 0 && (
                    <>
                      {" "}
                      <Badge texto={`Corregida ${e.correcciones}×`} tono="amarillo" />
                    </>
                  )}
                  {e.llego_tarde && (
                    <>
                      {" "}
                      <Badge texto="Llegó después del cierre" tono="naranja" />
                    </>
                  )}
                </span>
                <span style={{ textAlign: "right" }}>
                  {esSuperadmin && !e.llego_tarde && (
                    <button
                      onClick={() => (abierto === e.id ? setAbierto(null) : abrir(e))}
                      style={{
                        height: 34,
                        padding: "0 14px",
                        border: `1px solid ${ACCION}`,
                        borderRadius: 8,
                        background: "#fff",
                        color: ACCION,
                        fontSize: 13,
                        fontWeight: 500,
                        cursor: "pointer",
                      }}
                    >
                      {abierto === e.id ? "Cancelar" : "Corregir"}
                    </button>
                  )}
                </span>
              </div>

              {abierto === e.id && (
                <div style={{ padding: "0 20px 20px", background: "#FAFBFC" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 12, paddingTop: 16 }}>
                    <div>
                      <span style={label}>Nueva clasificación</span>
                      <select
                        style={inputBase}
                        value={clasificacion}
                        onChange={(ev) => setClasificacion(ev.target.value as Clasificacion)}
                      >
                        {CLASIFICACIONES.map((c) => (
                          <option key={c} value={c} disabled={c === e.clasificacion}>
                            {ETIQUETA_CLASIFICACION[c]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <span style={label}>Motivo (queda en la auditoría del período)</span>
                      <textarea
                        style={{ ...inputBase, height: 52, padding: "14px 12px", resize: "vertical" }}
                        value={motivo}
                        onChange={(ev) => setMotivo(ev.target.value)}
                        placeholder="Qué pasó y por qué se corrige. Mínimo 10 caracteres."
                      />
                    </div>
                  </div>
                  {error && (
                    <div
                      role="alert"
                      style={{
                        marginTop: 12,
                        padding: "10px 14px",
                        borderRadius: 8,
                        background: "#FDF0F0",
                        color: "#E24B4A",
                        fontSize: 13,
                        fontWeight: 500,
                      }}
                    >
                      {error}
                    </div>
                  )}
                  <button
                    onClick={() => guardar(e)}
                    disabled={guardando || motivo.trim().length < MOTIVO_MIN}
                    style={{
                      marginTop: 12,
                      height: 44,
                      padding: "0 20px",
                      border: "none",
                      borderRadius: 8,
                      background: ACCION,
                      color: "#fff",
                      fontSize: 14,
                      fontWeight: 500,
                      cursor: guardando ? "default" : "pointer",
                      opacity: guardando || motivo.trim().length < MOTIVO_MIN ? 0.5 : 1,
                    }}
                  >
                    {guardando ? "Aplicando…" : "Corregir y registrar"}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── El historial: la otra mitad de la regla ── */}
      <div style={{ ...card, padding: 20, marginTop: 20 }}>
        <h2 style={{ ...label, fontSize: 12, color: "#374151", marginBottom: 16 }}>
          Correcciones de {etiquetaPeriodo(periodo)}
        </h2>
        {historial.length === 0 ? (
          <p style={{ fontSize: 13, color: "#6B7280", margin: 0 }}>
            Ninguna. El mes está tal como se cerró.
          </p>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 12 }}>
            {historial.map((c) => (
              <li key={c.id} style={{ borderLeft: `3px solid ${ACCION}`, paddingLeft: 12 }}>
                <div style={{ fontSize: 13, color: "#111827" }}>
                  {c.de ? ETIQUETA_CLASIFICACION[c.de as Clasificacion] ?? c.de : "—"} →{" "}
                  <b>{c.a ? ETIQUETA_CLASIFICACION[c.a as Clasificacion] ?? c.a : "—"}</b>
                </div>
                <div style={{ fontSize: 13, color: "#4B5563", marginTop: 2 }}>{c.motivo}</div>
                <div style={{ fontSize: 12, color: "#9CA3AF", marginTop: 2 }}>
                  {c.admin_email ?? "superadmin"} · {momento(c.corregido_at)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {!esSuperadmin && (
        <p style={{ marginTop: 16, fontSize: 12, color: "#9CA3AF" }}>
          Estás viendo el período en modo lectura: corregir un mes cerrado es de
          superadministrador.
        </p>
      )}
    </div>
  );
}
