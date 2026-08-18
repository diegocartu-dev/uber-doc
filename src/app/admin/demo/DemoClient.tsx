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
  reintentarFirma,
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
  sinFirma,
}: {
  institucion: string;
  especialidades: string[];
  hayPlantillaWhatsApp: boolean;
  sesiones: SesionDemo[];
  sesionElegida: SesionDemo | null;
  participantes: ParticipanteDemo[];
  /** `medicos.id` de los profesionales que quedaron sin claves de firma. */
  sinFirma: string[];
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
  /**
   * El pedido de emitir un enlace NUEVO que está esperando confirmación. Lleva
   * el canal adentro: los dos caminos (mostrar el QR nuevo o mandarlo por
   * WhatsApp) emiten uno nuevo y echan al que entró, pero terminan distinto.
   */
  const [error, setError] = useState("");
  /**
   * Título de la demo a crear. Lo escribe Diego: el sistema no le pone fecha ni
   * nombre armado — la demo se llama como él quiera nombrarla.
   */
  const [tituloNuevo, setTituloNuevo] = useState("");
  const [aviso, setAviso] = useState("");
  const [copiado, setCopiado] = useState(false);
  const [confirmarLimpieza, setConfirmarLimpieza] = useState(false);
  const [problemas, setProblemas] = useState<string[]>([]);
  /**
   * Lo que va a fallar EN VIVO si nadie lo mira: la ventana de consulta inmediata
   * cerrada, o que ya no queden turnos de hoy. Va en su propia card ROJA, y no
   * mezclado en la lista verde de "agenda lista" — que es donde vivía y donde no
   * lo leía nadie.
   */
  const [alertas, setAlertas] = useState<string[]>([]);

  function limpiarMensajes() {
    setError("");
    setAviso("");
    setProblemas([]);
    setAlertas([]);
  }

  function crearReunion() {
    limpiarMensajes();
    const titulo = tituloNuevo.trim();
    if (!titulo) {
      setError("Ponele un título a la demo para poder crearla.");
      return;
    }
    startTransition(async () => {
      const res = await nuevaReunion(titulo);
      if (!res.ok || !res.sesionId) {
        setError(res.error ?? "No se pudo crear la demo.");
        return;
      }
      setTituloNuevo("");
      router.push(`/admin/demo?sesion=${res.sesionId}`);
      router.refresh();
    });
  }

  function invitar(e: React.FormEvent) {
    e.preventDefault();
    limpiarMensajes();
    if (!sesionElegida) {
      setError("Creá una demo antes de cargar participantes.");
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
      recordar(res.enlace);
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
      setProblemas(res.notas ?? []);
      setAlertas(res.alertas ?? []);
      if (!res.ok) setError(res.error ?? "No se pudo dejar la agenda lista.");
      else setAviso(`Agenda lista: ${res.resumen}`);
      router.refresh();
    });
  }

  /** Guarda el enlace recién emitido y lo pone en pantalla. */
  function recordar(nuevo: EnlaceListo) {
    setEnlace(nuevo);
  }

  /**
   * MOSTRAR el QUE YA TIENE. No emite nada, no toca la base y no echa a nadie:
   * si esta pantalla ya emitió su enlace, lo vuelve a proyectar tal cual.
   *
   * Si no lo tiene (se recargó la página, lo cargó otra persona), no hay forma
   * de reconstruirlo: en la base vive SOLO el sha256 del token, así que no
   * existe —ni puede existir— un camino de "leerlo del server". La única salida
   * es emitir uno nuevo, y eso echa a quien esté adentro.
   */
  /**
   * Mostrar el QR de alguien. Devuelve SIEMPRE el mismo enlace.
   *
   * Antes esto emitía uno nuevo —y emitir echa a quien ya había entrado, con su
   * teléfono en la mano y delante de todos—, porque la base guardaba solo el
   * hash del token y el enlace no se podía recuperar. Con la migración 029 el
   * token de una demo se guarda, así que el servidor devuelve el que ya existe:
   * mostrar el QR volvió a ser una lectura. De ahí que ya no haya botón
   * "Regenerar" ni diálogo de advertencia: no hay nada que advertir.
   */
  function verQR(p: ParticipanteDemo) {
    limpiarMensajes();
    startTransition(async () => {
      const res = await mostrarQR(p.id);
      if (!res.ok) setError(res.error);
      else recordar(res.enlace);
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
      recordar(res.enlace);
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

  function arreglarFirma(medicoId: string) {
    limpiarMensajes();
    startTransition(async () => {
      const res = await reintentarFirma(medicoId);
      if (res.ok) setAviso("Listo: ese profesional ya puede firmar.");
      else setError(res.error ?? "No se pudieron crear las claves de firma.");
      router.refresh();
    });
  }

  function limpiar() {
    if (!sesionElegida) return;
    limpiarMensajes();
    setConfirmarLimpieza(false);
    startTransition(async () => {
      const res = await limpiarReunion(sesionElegida.id);
      // Los `retenidos` se muestran en las DOS ramas: son la explicación de por
      // qué una ficha sobrevivió (la firma del participante la retiene) y de qué
      // se hizo con ella (quedó anonimizada). Sin ese renglón, "reunión limpia"
      // y una fila viva en la base se contradicen sin que nadie lo sepa.
      setProblemas([...(res.problemas ?? []), ...(res.retenidos ?? [])]);
      if (!res.ok) {
        setError(res.error ?? "No se pudo eliminar la demo.");
      } else {
        setAviso(`Demo eliminada: se borraron ${res.participantes ?? 0} participantes, sus accesos y todo lo que crearon.`);
      }
      setEnlace(null);
      router.refresh();
    });
  }

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 24px 64px" }}>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 600, color: "#111827", margin: 0 }}>
          Demo funcional
        </h1>
        <p style={{ fontSize: 14, color: "#4B5563", margin: "6px 0 0" }}>
          Cargá a cada participante con su nombre y su celular. El sistema le crea la cuenta y el
          enlace; vos mostrás el QR y esa persona entra a {institucion} desde su teléfono.
        </p>
      </header>

      {/* ── La reunión ────────────────────────────────────────────────── */}
      <section style={{ ...card, padding: 20, marginBottom: 20 }}>
        <span style={label}>Demo</span>
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
          <input
            type="text"
            value={tituloNuevo}
            onChange={(e) => setTituloNuevo(e.target.value)}
            placeholder="Título de la demo nueva"
            aria-label="Título de la demo nueva"
            style={{ ...input, maxWidth: 260 }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                crearReunion();
              }
            }}
          />
          <button type="button" onClick={crearReunion} disabled={pendiente || !tituloNuevo.trim()} style={btnSec}>
            Crear demo
          </button>
          {sesionElegida && !sesionElegida.cerrada_at && (
            <button
              type="button"
              onClick={() => setConfirmarLimpieza(true)}
              disabled={pendiente}
              style={{ ...btnPeligro, marginLeft: "auto" }}
            >
              Eliminar demo
            </button>
          )}
        </div>
        {sesionElegida?.cerrada_at && (
          <p style={{ fontSize: 13, color: "#9CA3AF", margin: "12px 0 0" }}>
            Esta demo ya se eliminó: no se le pueden cargar participantes.
          </p>
        )}
      </section>

      {alertas.length > 0 && (
        <div
          style={{ ...card, padding: 16, marginBottom: 20, borderColor: ROJO, background: "#FDECEC" }}
        >
          <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#8A2E2D" }}>
            Ojo antes de empezar
          </p>
          <ul style={{ margin: "8px 0 0 18px", fontSize: 13, color: "#8A2E2D" }}>
            {alertas.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </div>
      )}
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
                    title="Le manda por WhatsApp este mismo enlace"
                    onClick={() => mandarWhatsApp(enlace.participante.id)}
                  >
                    Mandar por WhatsApp
                  </button>
                )}
              </div>
              {enlace.firmaLista === false && (
                <p style={{ fontSize: 13, color: "#8A2E2D", margin: "12px 0 0", fontWeight: 500 }}>
                  Quedó sin claves de firma: sus documentos van a salir sin sello. Usá “Reintentar
                  firma” en la lista de abajo antes de la escena de la receta.
                </p>
              )}
              <p style={{ fontSize: 12, color: "#9CA3AF", margin: "12px 0 0" }}>
                Este enlace es de un solo participante y no vence. “Ver QR” vuelve a mostrar este
                mismo, las veces que haga falta. Se apaga cuando eliminás la demo.
              </p>
            </div>
          )}
        </section>
      </div>

      {/* ── Quiénes están en la sala ───────────────────────────────── */}
      <section style={{ ...card, padding: 20, marginTop: 20 }}>
        <span style={label}>En esta demo ({participantes.length})</span>
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
                  {p.medico_id && sinFirma.includes(p.medico_id) && (
                    <span
                      style={{ color: ROJO, fontSize: 13, whiteSpace: "nowrap" }}
                      title="Sin claves de firma: sus documentos salen sin sello y la verificación pública queda en ámbar"
                    >
                      sin firma
                    </span>
                  )}
                  <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                    {p.medico_id && sinFirma.includes(p.medico_id) && (
                      <button
                        type="button"
                        style={btnPeligro}
                        disabled={pendiente}
                        onClick={() => arreglarFirma(p.medico_id as string)}
                      >
                        Reintentar firma
                      </button>
                    )}
                    {p.rol === "profesional" && p.medico_id && (
                      <button
                        type="button"
                        style={btnSec}
                        disabled={pendiente}
                        title="Turnos desde hoy hasta el 30 de agosto (la ventana que mira el call center), en UNA sola mitad del día: la otra queda libre para que Nova tenga dónde crear. Además, algunos horarios ya ocupados y un profesional de respaldo para reprogramar. Tocarlo dos veces no duplica nada."
                        onClick={() => prepararAgenda(p.medico_id as string)}
                      >
                        Preparar agenda
                      </button>
                    )}
                    <button type="button" style={btnSec} disabled={pendiente} onClick={() => verQR(p)}>
                      Ver QR
                    </button>
                    {hayPlantillaWhatsApp && p.celular && (
                      <button
                        type="button"
                        style={btnSec}
                        disabled={pendiente}
                        title="Le manda por WhatsApp el mismo enlace del QR"
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

      {/* ── Confirmación de "regenerar" (dialog React, nunca window.confirm) ──
          El participante ya está adentro: emitir un enlace nuevo lo deja afuera
          en el acto, con la pantalla proyectada. Se pregunta. */}

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
            {/* ── LO QUE QUEDA, DICHO ANTES DE APRETAR ─────────────────────
                Este párrafo decía "su ficha queda pero sin nombre ni celular" y
                se detenía ahí, como si lo único retenido fuera la ficha. Lo que
                de verdad sobrevive es más: el documento firmado y su registro de
                firma, que son append-only y no se pueden borrar. Diego lo tiene
                que saber ANTES de decir "reunión limpia" delante de alguien. */}
            <p style={{ fontSize: 13, color: "#8A2E2D", margin: "0 0 20px" }}>
              Lo que NO se va: si alguien firmó un documento, ese documento y su registro de firma
              quedan en la base para siempre (son append-only por ley) y su página de verificación
              sigue en línea, diciendo que es de demostración. No llevan el nombre de nadie: el
              sello se emite con nombre de utilería. La ficha del profesional también queda,
              anonimizada y fuera de la oferta. Abajo te decimos exactamente qué quedó.
            </p>
            {/* ── EL TEXTO QUE ESCRIBIÓ LA PERSONA, DICHO APARTE ────────────
                El párrafo de arriba habla del SELLO, que nunca llevó nombres.
                Pero el cuerpo del documento es lo que el participante tipeó en
                el workspace delante de la sala, y ahí puede haber escrito el
                nombre de cualquiera. Eso sí se borra, y borrarlo tiene una
                consecuencia visible que Diego tiene que conocer antes. */}
            <p style={{ fontSize: 13, color: "#8A2E2D", margin: "0 0 20px" }}>
              Lo que el participante <strong>escribió a mano</strong> en esos documentos
              (indicaciones, diagnóstico, tratamiento) sí se borra, porque es texto libre y puede
              llevar el nombre de cualquiera. Como el sello cubre ese texto, la página de
              verificación de esos documentos va a pasar a decir <strong>“alterado”</strong>. Es
              la verdad —lo alteramos nosotros para sacar datos de personas— sobre un papel que ya
              decía “SIN VALIDEZ LEGAL”.
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
