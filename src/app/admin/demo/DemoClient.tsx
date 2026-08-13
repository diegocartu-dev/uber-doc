"use client";

// La pantalla de la reunión — lenguaje de diseño APROBADO (07-handoff/tokens.css,
// mismo vocabulario que PadronClient y OperadoresClient): labels uppercase 11px,
// cards 12px de radio, azul #378ADD para la acción, rojo #E24B4A para lo
// destructivo, dialogs React inline (JAMÁS window.confirm).
//
// ── PENSADA PARA PROYECTARSE ─────────────────────────────────────────────────
// Esto se ve en una pantalla grande, delante de gente, mientras Diego habla. Por
// eso: el QR ocupa media pantalla cuando aparece, los estados se leen de lejos
// (un punto de color y una palabra), y el formulario tiene DOS campos
// obligatorios y nada más. Todo lo opcional está plegado.
//
// Nada de lo que se escribe acá —nombres, celulares— sale jamás del navegador
// hacia otro lado que no sea la base de la instancia.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  nuevaReunion,
  cargarParticipante,
  mostrarQR,
  enviarPorWhatsApp,
  limpiarReunion,
  prepararEscenarioDemo,
  type EnlaceListo,
} from "./actions";
import type { ParticipanteDemo, SesionDemo } from "@/lib/institucional/demo";

const ACCION = "#378ADD";
const VERDE = "#1D9E75";
const ROJO = "#E24B4A";
const PENDIENTE = "#BA7517";

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
const input: React.CSSProperties = {
  width: "100%",
  height: 52,
  padding: "0 14px",
  border: "1px solid #E5E7EB",
  borderRadius: 8,
  fontSize: 15,
  color: "#111827",
  background: "#fff",
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
  padding: "0 16px",
  border: "1px solid #D1D5DB",
  borderRadius: 8,
  background: "#fff",
  color: "#111827",
  fontSize: 13,
  fontWeight: 500,
  cursor: "pointer",
};
const btnPeligro: React.CSSProperties = {
  ...btnSec,
  border: `1px solid ${ROJO}`,
  color: ROJO,
};

const ESTADOS: Record<string, { texto: string; color: string }> = {
  invitado: { texto: "Invitado", color: PENDIENTE },
  entro: { texto: "Entró", color: VERDE },
  atendiendo: { texto: "Atendiendo", color: VERDE },
};

export default function DemoClient({
  institucion,
  especialidades,
  hayPlantillaWhatsApp,
  sesiones,
  sesionElegida,
  participantes,
}: {
  institucion: string;
  especialidades: string[];
  hayPlantillaWhatsApp: boolean;
  sesiones: SesionDemo[];
  sesionElegida: SesionDemo | null;
  participantes: ParticipanteDemo[];
}) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();

  const [rol, setRol] = useState<"profesional" | "paciente">("profesional");
  const [nombre, setNombre] = useState("");
  const [celular, setCelular] = useState("");
  const [titulo, setTitulo] = useState("");
  const [especialidad, setEspecialidad] = useState(especialidades[0] ?? "");
  const [dni, setDni] = useState("");
  const [fechaNac, setFechaNac] = useState("");
  const [masDatos, setMasDatos] = useState(false);

  const [enlace, setEnlace] = useState<EnlaceListo | null>(null);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [copiado, setCopiado] = useState(false);
  const [confirmarLimpieza, setConfirmarLimpieza] = useState(false);
  const [problemas, setProblemas] = useState<string[]>([]);

  function limpiarMensajes() {
    setError("");
    setAviso("");
    setProblemas([]);
  }

  function crearReunion() {
    limpiarMensajes();
    startTransition(async () => {
      const res = await nuevaReunion("");
      if (!res.ok || !res.sesionId) {
        setError(res.error ?? "No se pudo crear la reunión.");
        return;
      }
      router.push(`/admin/demo?sesion=${res.sesionId}`);
      router.refresh();
    });
  }

  function invitar(e: React.FormEvent) {
    e.preventDefault();
    limpiarMensajes();
    if (!sesionElegida) {
      setError("Creá una reunión antes de cargar participantes.");
      return;
    }
    startTransition(async () => {
      const res = await cargarParticipante({
        sesionId: sesionElegida.id,
        nombre,
        celular,
        rol,
        titulo: rol === "profesional" ? titulo : undefined,
        especialidad: rol === "profesional" ? especialidad : undefined,
        dni: rol === "paciente" ? dni : undefined,
        fecha_nacimiento: rol === "paciente" ? fechaNac : undefined,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setEnlace(res.enlace);
      setNombre("");
      setCelular("");
      setDni("");
      setFechaNac("");
      router.refresh();
    });
  }

  function prepararAgenda(medicoId: string) {
    if (!sesionElegida) return;
    limpiarMensajes();
    startTransition(async () => {
      const res = await prepararEscenarioDemo({ sesionId: sesionElegida.id, medicoId });
      if (!res.ok) {
        setError(res.error ?? "No se pudo dejar la agenda lista.");
        setProblemas(res.notas ?? []);
      } else {
        setAviso(`Agenda lista: ${res.resumen}`);
        setProblemas(res.notas ?? []);
      }
      router.refresh();
    });
  }

  function verQR(participanteId: string) {
    limpiarMensajes();
    startTransition(async () => {
      const res = await mostrarQR(participanteId);
      if (!res.ok) setError(res.error);
      else setEnlace(res.enlace);
      router.refresh();
    });
  }

  function mandarWhatsApp(participanteId: string) {
    limpiarMensajes();
    startTransition(async () => {
      const res = await enviarPorWhatsApp(participanteId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setEnlace(res.enlace);
      setAviso(res.enlace.whatsapp?.detalle ?? "");
      router.refresh();
    });
  }

  async function copiar(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      setError("El navegador no dejó copiar. Mostrá el QR.");
    }
  }

  function limpiar() {
    if (!sesionElegida) return;
    limpiarMensajes();
    setConfirmarLimpieza(false);
    startTransition(async () => {
      const res = await limpiarReunion(sesionElegida.id);
      if (!res.ok) {
        setError(res.error ?? "No se pudo limpiar la reunión.");
        setProblemas(res.problemas ?? []);
      } else {
        setAviso(`Reunión limpia: se borraron ${res.participantes ?? 0} participantes y todo lo que crearon.`);
      }
      setEnlace(null);
      router.refresh();
    });
  }

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 24px 64px" }}>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 600, color: "#111827", margin: 0 }}>
          Reunión de demostración
        </h1>
        <p style={{ fontSize: 14, color: "#4B5563", margin: "6px 0 0" }}>
          Cargá a cada participante con su nombre y su celular. El sistema le crea la cuenta y el
          enlace; vos mostrás el QR y esa persona entra a {institucion} desde su teléfono.
        </p>
      </header>

      {/* ── La reunión ────────────────────────────────────────────────── */}
      <section style={{ ...card, padding: 20, marginBottom: 20 }}>
        <span style={label}>Reunión</span>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <select
            value={sesionElegida?.id ?? ""}
            onChange={(e) => router.push(`/admin/demo?sesion=${e.target.value}`)}
            style={{ ...input, width: "auto", minWidth: 260, height: 44 }}
            disabled={sesiones.length === 0}
          >
            {sesiones.length === 0 && <option value="">Todavía no hay ninguna</option>}
            {sesiones.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre} · {s.fecha}
                {s.cerrada_at ? " · limpia" : ""}
              </option>
            ))}
          </select>
          <button type="button" onClick={crearReunion} disabled={pendiente} style={btnSec}>
            Nueva reunión
          </button>
          {sesionElegida && !sesionElegida.cerrada_at && (
            <button
              type="button"
              onClick={() => setConfirmarLimpieza(true)}
              disabled={pendiente}
              style={{ ...btnPeligro, marginLeft: "auto" }}
            >
              Limpiar reunión
            </button>
          )}
        </div>
        {sesionElegida?.cerrada_at && (
          <p style={{ fontSize: 13, color: "#9CA3AF", margin: "12px 0 0" }}>
            Esta reunión ya se limpió: no se le pueden cargar participantes.
          </p>
        )}
      </section>

      {error && (
        <div
          style={{ ...card, padding: 16, marginBottom: 20, borderColor: ROJO, background: "#FDECEC" }}
        >
          <p style={{ margin: 0, fontSize: 14, color: "#8A2E2D" }}>{error}</p>
          {problemas.length > 0 && (
            <ul style={{ margin: "8px 0 0 18px", fontSize: 13, color: "#8A2E2D" }}>
              {problemas.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {aviso && (
        <div style={{ ...card, padding: 16, marginBottom: 20, borderColor: VERDE, background: "#E8F5F0" }}>
          <p style={{ margin: 0, fontSize: 14, color: "#12684C" }}>{aviso}</p>
          {problemas.length > 0 && (
            <ul style={{ margin: "8px 0 0 18px", fontSize: 13, color: "#12684C" }}>
              {problemas.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 20 }}>
        {/* ── Cargar participante ───────────────────────────────────── */}
        <section style={{ ...card, padding: 20 }}>
          <span style={label}>Cargar participante</span>

          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            {(["profesional", "paciente"] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRol(r)}
                style={{
                  flex: 1,
                  height: 44,
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: "pointer",
                  border: `1px solid ${rol === r ? ACCION : "#E5E7EB"}`,
                  background: rol === r ? "#EBF3FC" : "#fff",
                  color: rol === r ? "#2D75C4" : "#4B5563",
                }}
              >
                {r === "profesional" ? "Profesional" : "Paciente"}
              </button>
            ))}
          </div>

          <form onSubmit={invitar}>
            <div style={{ marginBottom: 14 }}>
              <span style={label}>Nombre y apellido</span>
              <input
                style={input}
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Como quiera que aparezca en pantalla"
                autoComplete="off"
              />
            </div>
            <div style={{ marginBottom: 14 }}>
              <span style={label}>Celular (opcional)</span>
              <input
                style={input}
                value={celular}
                onChange={(e) => setCelular(e.target.value)}
                placeholder="11 2345 6789"
                inputMode="tel"
                autoComplete="off"
              />
              <p style={{ fontSize: 12, color: "#9CA3AF", margin: "6px 0 0" }}>
                Sin celular entra igual escaneando el QR. Con celular, además le llegan los avisos
                del sistema durante la demo.
              </p>
            </div>

            {rol === "profesional" && (
              <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
                <div style={{ width: 110 }}>
                  <span style={label}>Título</span>
                  <select style={{ ...input, padding: "0 8px" }} value={titulo} onChange={(e) => setTitulo(e.target.value)}>
                    <option value="">—</option>
                    <option value="Dr.">Dr.</option>
                    <option value="Dra.">Dra.</option>
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <span style={label}>Especialidad</span>
                  <select
                    style={{ ...input, padding: "0 8px" }}
                    value={especialidad}
                    onChange={(e) => setEspecialidad(e.target.value)}
                  >
                    {especialidades.map((e) => (
                      <option key={e} value={e}>
                        {e}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {rol === "paciente" && (
              <div style={{ marginBottom: 14 }}>
                <button
                  type="button"
                  onClick={() => setMasDatos((v) => !v)}
                  style={{ ...btnSec, height: 32, fontSize: 12 }}
                >
                  {masDatos ? "Ocultar datos opcionales" : "Datos que salen en el documento (opcional)"}
                </button>
                {masDatos && (
                  <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
                    <div style={{ flex: 1 }}>
                      <span style={label}>DNI</span>
                      <input style={input} value={dni} onChange={(e) => setDni(e.target.value)} inputMode="numeric" />
                    </div>
                    <div style={{ flex: 1 }}>
                      <span style={label}>Nacimiento</span>
                      <input
                        style={input}
                        type="date"
                        value={fechaNac}
                        onChange={(e) => setFechaNac(e.target.value)}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={pendiente || !sesionElegida || Boolean(sesionElegida?.cerrada_at)}
              style={{ ...btnPrimario, width: "100%", opacity: pendiente ? 0.6 : 1 }}
            >
              {pendiente ? "Creando…" : "Crear cuenta y mostrar QR"}
            </button>
          </form>
        </section>

        {/* ── El QR ─────────────────────────────────────────────────── */}
        <section style={{ ...card, padding: 20, display: "flex", flexDirection: "column" }}>
          <span style={label}>Enlace para escanear</span>
          {!enlace ? (
            <div
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                minHeight: 320,
                color: "#9CA3AF",
                fontSize: 14,
                textAlign: "center",
                padding: 24,
              }}
            >
              Cargá un participante y acá aparece su QR, para proyectarlo.
            </div>
          ) : (
            <div style={{ textAlign: "center" }}>
              <p style={{ fontSize: 18, fontWeight: 600, color: "#111827", margin: "0 0 4px" }}>
                {enlace.participante.nombre}
              </p>
              <p style={{ fontSize: 13, color: "#4B5563", margin: "0 0 16px" }}>
                {enlace.participante.rol === "profesional"
                  ? "Entra a su espacio de trabajo, listo para atender."
                  : "Entra a su pantalla; cuando le asignen el turno, salta sola."}
              </p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={enlace.qr}
                alt="Código QR del enlace de acceso"
                style={{ width: "100%", maxWidth: 340, height: "auto", borderRadius: 8 }}
              />
              <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 16, flexWrap: "wrap" }}>
                <button type="button" style={btnSec} onClick={() => copiar(enlace.url)}>
                  {copiado ? "Copiado" : "Copiar enlace"}
                </button>
                {hayPlantillaWhatsApp && enlace.participante.celular && (
                  <button
                    type="button"
                    style={btnSec}
                    disabled={pendiente}
                    onClick={() => mandarWhatsApp(enlace.participante.id)}
                  >
                    Mandar por WhatsApp
                  </button>
                )}
              </div>
              <p style={{ fontSize: 12, color: "#9CA3AF", margin: "12px 0 0" }}>
                Este enlace es de un solo participante. Si volvés a generarlo, el anterior deja de
                funcionar.
              </p>
            </div>
          )}
        </section>
      </div>

      {/* ── Quiénes están en la sala ───────────────────────────────── */}
      <section style={{ ...card, padding: 20, marginTop: 20 }}>
        <span style={label}>En esta reunión ({participantes.length})</span>
        {participantes.length === 0 ? (
          <p style={{ fontSize: 14, color: "#9CA3AF", margin: "12px 0 0" }}>
            Todavía no cargaste a nadie.
          </p>
        ) : (
          <div style={{ marginTop: 8 }}>
            {participantes.map((p) => {
              const estado = ESTADOS[p.estado] ?? ESTADOS.invitado;
              return (
                <div
                  key={p.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    height: 64,
                    borderTop: "1px solid #F1F3F4",
                    fontSize: 14,
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 99,
                      background: estado.color,
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ fontWeight: 500, color: "#111827", minWidth: 180 }}>{p.nombre}</span>
                  <span style={{ color: "#4B5563", width: 110 }}>
                    {p.rol === "profesional" ? "Profesional" : "Paciente"}
                  </span>
                  <span style={{ color: estado.color, width: 100 }}>{estado.texto}</span>
                  <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                    {p.rol === "profesional" && p.medico_id && (
                      <button
                        type="button"
                        style={btnSec}
                        disabled={pendiente}
                        title="Turnos del 20 al 30 de agosto, una franja de hoy para el call center, y algunos horarios ya ocupados"
                        onClick={() => prepararAgenda(p.medico_id as string)}
                      >
                        Preparar agenda
                      </button>
                    )}
                    <button type="button" style={btnSec} disabled={pendiente} onClick={() => verQR(p.id)}>
                      Ver QR
                    </button>
                    {hayPlantillaWhatsApp && p.celular && (
                      <button
                        type="button"
                        style={btnSec}
                        disabled={pendiente}
                        onClick={() => mandarWhatsApp(p.id)}
                      >
                        WhatsApp
                      </button>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Confirmación de limpieza (dialog React, nunca window.confirm) ── */}
      {confirmarLimpieza && sesionElegida && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(16,24,40,.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: 24,
          }}
        >
          <div style={{ ...card, padding: 24, maxWidth: 460 }}>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: "#111827", margin: "0 0 8px" }}>
              ¿Limpiar “{sesionElegida.nombre}”?
            </h2>
            <p style={{ fontSize: 14, color: "#4B5563", margin: "0 0 20px" }}>
              Se borran los {participantes.length} participantes con sus datos, y los turnos,
              consultas y documentos que hayan generado. No se toca nada más de {institucion}.
              Esto no se puede deshacer.
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" style={btnSec} onClick={() => setConfirmarLimpieza(false)}>
                Cancelar
              </button>
              <button
                type="button"
                style={{ ...btnPeligro, height: 48, padding: "0 20px", fontSize: 14 }}
                onClick={limpiar}
                disabled={pendiente}
              >
                Sí, limpiar todo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
