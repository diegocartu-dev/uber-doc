"use client";

import { useMemo, useState } from "react";
import { Eye, PauseCircle, ShieldOff, RotateCcw, Loader2, LogIn } from "lucide-react";
import { BarraTabla, CabezaTabla, useVistaTabla, type Columna } from "@/components/tabla/TablaDatos";
import StatusBadge from "../components/StatusBadge";
import ConfirmDialog from "../components/ConfirmDialog";
import SidePanel from "../components/SidePanel";
import DuplicatesBanner from "../components/DuplicatesBanner";

interface Paciente {
  id: string;
  user_id: string;
  nombre_completo: string;
  email: string | null;
  dni: string | null;
  fecha_nacimiento: string | null;
  obra_social: string | null;
  estado_cuenta: string | null;
  motivo_estado: string | null;
  estado_hasta: string | null;
  created_at: string;
}

// El ESTADO se ordena por ciclo de vida, no por su inicial: primero el que opera normal.
const CICLO_ESTADO = ["activo", "pausado", "bloqueado"];

// `totalInicial` ya no se usa: la pantalla trae todas las filas y la cuenta la muestra la
// barra de la tabla ("N de M"). Se deja en las props para no tocar el server component.
export default function PacientesClient({ pacientes: initial }: { pacientes: Paciente[]; totalInicial?: number }) {
  const [pacientes, setPacientes] = useState(initial);
  const [procesando, setProcesando] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState<{ id: string; accion: string } | null>(null);
  const [panelPaciente, setPanelPaciente] = useState<Paciente | null>(null);
  const [duracion, setDuracion] = useState<string>("7d");
  const [mensaje, setMensaje] = useState<{ texto: string; tipo: "ok" | "error" } | null>(null);

  // Las columnas: esto es TODO lo que la pantalla declara. El buscador, el orden, el
  // embudo, el ancho ajustable y la vista en la URL salen de acá.
  const COLUMNAS: Columna<Paciente>[] = useMemo(() => [
    { k: "paciente", t: "Paciente", val: (p) => p.nombre_completo || "Sin nombre",
      // El DNI se busca aunque no tenga columna propia: quien lo tiene a mano lo tipea.
      busca: (p) => `${p.nombre_completo ?? ""} ${p.dni ?? ""}` },
    { k: "email", t: "Email", val: (p) => p.email, porEvento: true },
    { k: "registro", t: "Registro", val: (p) => p.created_at, tipo: "fecha", porEvento: true },
    { k: "estado", t: "Estado", val: (p) => p.estado_cuenta ?? "activo", rango: CICLO_ESTADO },
    { k: "acc", t: "Acciones", val: () => "", sinOrden: true, sinBuscar: true },
  ], []);

  const vista = useVistaTabla(pacientes, COLUMNAS, {
    clave: (p) => p.id,
    // Lo más nuevo arriba. Sin masNuevoPrimero a propósito: su respaldo por id numérico no
    // sirve acá (el id es un uuid), y created_at nunca falta en esta tabla.
    defecto: (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at),
  });

  async function handleImpersonate(userId: string, nombre: string) {
    setProcesando(userId);
    setMensaje(null);
    try {
      const res = await fetch("/api/admin/impersonate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json();
      if (data.ok && data.link) {
        window.open(data.link, "_blank");
        setMensaje({ texto: `Sesión abierta como ${nombre}`, tipo: "ok" });
      } else {
        setMensaje({ texto: data.error || "No se pudo generar el acceso", tipo: "error" });
      }
    } catch {
      setMensaje({ texto: "Error de conexión", tipo: "error" });
    }
    setProcesando(null);
  }

  async function handleAccion(pacienteId: string, accion: string, motivo?: string) {
    setProcesando(pacienteId);
    setMensaje(null);
    try {
      const res = await fetch("/api/admin/pacientes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pacienteId, accion, motivo, duracion: accion === "pausar" ? duracion : undefined }),
      });
      const data = await res.json();
      if (data.ok) {
        setPacientes((prev) =>
          prev.map((p) =>
            p.id === pacienteId
              ? { ...p, estado_cuenta: data.estado, motivo_estado: motivo ?? null }
              : p
          )
        );
        setMensaje({ texto: `Paciente ${accion === "reactivar" ? "reactivado" : accion === "pausar" ? "pausado" : "bloqueado"}`, tipo: "ok" });
      } else {
        setMensaje({ texto: data.error || "Error", tipo: "error" });
      }
    } catch {
      setMensaje({ texto: "Error de conexión", tipo: "error" });
    }
    setProcesando(null);
    setConfirmando(null);
  }

  return (
    <div className="p-6 lg:p-8">
      <h1 className="text-xl font-semibold text-gray-900">Pacientes</h1>

      {/* Banner duplicados */}
      <div className="mt-4">
        <DuplicatesBanner />
      </div>

      {mensaje && (
        <p className={`mt-3 text-center text-sm ${mensaje.tipo === "ok" ? "text-[#1D9E75]" : "text-[#E24B4A]"}`}>
          {mensaje.texto}
        </p>
      )}

      <BarraTabla vista={vista} placeholder="Buscar por nombre, email o DNI…" cuenta="pacientes" />

      {/* El scroll vive acá, con tope de alto: así la cabecera se pega al borde de ESTE
          cuadro y los títulos no se pierden al scrollear la página. */}
      <div className="overflow-auto rounded-xl bg-white max-h-[72vh]" style={{ border: "1px solid #e5e7eb" }}>
        <table className="w-full border-separate border-spacing-0 text-sm">
          <CabezaTabla vista={vista} />
          <tbody className="divide-y divide-gray-50">
            {vista.filas.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                  No se encontraron pacientes
                </td>
              </tr>
            )}
            {vista.filas.map((p) => {
              const estado = p.estado_cuenta ?? "activo";
              return (
                <tr key={p.id} className="hover:bg-gray-50/50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{p.nombre_completo || "Sin nombre"}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{p.email || "—"}</td>
                  <td className="px-4 py-3 text-gray-500">
                    {new Date(p.created_at).toLocaleDateString("es-AR")}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={estado} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setPanelPaciente(p)}
                        className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-gray-500 transition hover:bg-gray-100 hover:text-gray-700"
                      >
                        <Eye size={14} /> Ver
                      </button>
                      <button
                        onClick={() => handleImpersonate(p.user_id, p.nombre_completo)}
                        disabled={procesando === p.user_id}
                        className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-gray-500 transition hover:bg-blue-50 hover:text-[#378ADD]"
                      >
                        {procesando === p.user_id ? <Loader2 size={14} className="animate-spin" /> : <LogIn size={14} />}
                        Ingresar
                      </button>
                      {estado === "activo" && (
                        <>
                          <button
                            onClick={() => setConfirmando({ id: p.id, accion: "pausar" })}
                            className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-gray-500 transition hover:bg-orange-50 hover:text-[#D85A30]"
                          >
                            <PauseCircle size={14} /> Pausar
                          </button>
                          <button
                            onClick={() => setConfirmando({ id: p.id, accion: "bloquear" })}
                            className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-gray-500 transition hover:bg-red-50 hover:text-[#E24B4A]"
                          >
                            <ShieldOff size={14} /> Bloquear
                          </button>
                        </>
                      )}
                      {(estado === "pausado" || estado === "bloqueado") && (
                        <button
                          onClick={() => setConfirmando({ id: p.id, accion: "reactivar" })}
                          disabled={procesando === p.id}
                          className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-gray-500 transition hover:bg-blue-50 hover:text-[#378ADD]"
                        >
                          {procesando === p.id ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
                          Reactivar
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Confirm dialogs */}
      {confirmando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20" onClick={() => setConfirmando(null)}>
          <div className="mx-4 w-full max-w-md rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            {confirmando.accion === "pausar" && (
              <>
                <ConfirmDialog
                  title="Pausar paciente?"
                  description="El paciente no podra iniciar nuevas consultas."
                  confirmLabel="Pausar"
                  variant="warning"
                  requireReason
                  reasonPlaceholder="Motivo de la pausa..."
                  onConfirm={(motivo) => handleAccion(confirmando.id, "pausar", motivo)}
                  onCancel={() => setConfirmando(null)}
                  isLoading={procesando === confirmando.id}
                />
                <div className="mt-3 flex gap-2">
                  <p className="text-xs text-gray-500 mr-2">Duracion:</p>
                  {["7d", "30d", "indefinido"].map((d) => (
                    <button
                      key={d}
                      onClick={() => setDuracion(d)}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                        duracion === d ? "border-[#378ADD] bg-[#378ADD]/10 text-[#378ADD]" : "border-gray-200 text-gray-500 hover:bg-gray-50"
                      }`}
                    >
                      {d === "7d" ? "7 dias" : d === "30d" ? "30 dias" : "Indefinido"}
                    </button>
                  ))}
                </div>
              </>
            )}
            {confirmando.accion === "bloquear" && (
              <ConfirmDialog
                title="Bloquear paciente?"
                description="El paciente no podra acceder a la plataforma."
                confirmLabel="Bloquear"
                variant="danger"
                requireReason
                reasonPlaceholder="Motivo del bloqueo..."
                onConfirm={(motivo) => handleAccion(confirmando.id, "bloquear", motivo)}
                onCancel={() => setConfirmando(null)}
                isLoading={procesando === confirmando.id}
              />
            )}
            {confirmando.accion === "reactivar" && (
              <ConfirmDialog
                title="Reactivar paciente?"
                description="El paciente podra volver a usar la plataforma."
                confirmLabel="Si, reactivar"
                variant="primary"
                requireReason
                minReasonLength={10}
                reasonPlaceholder="Motivo de la reactivacion..."
                onConfirm={(motivo) => handleAccion(confirmando.id, "reactivar", motivo)}
                onCancel={() => setConfirmando(null)}
                isLoading={procesando === confirmando.id}
              />
            )}
          </div>
        </div>
      )}

      {/* Side panel */}
      <SidePanel
        open={!!panelPaciente}
        onClose={() => setPanelPaciente(null)}
        title={panelPaciente?.nombre_completo ?? "Paciente"}
      >
        {panelPaciente && (
          <>
            <PacienteDetalle paciente={panelPaciente} />
            <div className="mt-6 border-t border-gray-100 pt-4">
              <button
                onClick={() => handleImpersonate(panelPaciente.user_id, panelPaciente.nombre_completo)}
                disabled={procesando === panelPaciente.user_id}
                className="inline-flex items-center gap-2 rounded-lg border border-[#378ADD] px-4 py-2 text-sm font-medium text-[#378ADD] transition hover:bg-[#378ADD]/5"
              >
                {procesando === panelPaciente.user_id ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />}
                Ingresar como paciente
              </button>
            </div>
          </>
        )}
      </SidePanel>
    </div>
  );
}

function PacienteDetalle({ paciente: p }: { paciente: Paciente }) {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Información personal</p>
        <div className="mt-3 space-y-2 text-sm">
          <Field label="Nombre" value={p.nombre_completo} />
          <Field label="Email" value={p.email} />
          <Field label="DNI" value={p.dni} />
          <Field label="Fecha nacimiento" value={p.fecha_nacimiento} />
          <Field label="Obra social" value={p.obra_social} />
        </div>
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Estado de cuenta</p>
        <div className="mt-3 space-y-2 text-sm">
          <div><span className="text-gray-400">Estado:</span> <StatusBadge status={p.estado_cuenta ?? "activo"} /></div>
          {p.motivo_estado && <Field label="Motivo" value={p.motivo_estado} />}
          {p.estado_hasta && <Field label="Hasta" value={new Date(p.estado_hasta).toLocaleDateString("es-AR")} />}
          <Field label="Registro" value={new Date(p.created_at).toLocaleDateString("es-AR")} />
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <p>
      <span className="text-gray-400">{label}:</span>{" "}
      <span className="text-gray-700">{value || "—"}</span>
    </p>
  );
}
