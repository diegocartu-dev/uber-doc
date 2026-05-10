"use client";

import { useState } from "react";
import { Search, Eye, PauseCircle, ShieldOff, RotateCcw, Loader2 } from "lucide-react";
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

type Tab = "todos" | "pausado" | "bloqueado";

const TABS: { key: Tab; label: string }[] = [
  { key: "todos", label: "Todos" },
  { key: "pausado", label: "Pausados" },
  { key: "bloqueado", label: "Bloqueados" },
];

export default function PacientesClient({ pacientes: initial, totalInicial = 0 }: { pacientes: Paciente[]; totalInicial?: number }) {
  const [pacientes, setPacientes] = useState(initial);
  const [tab, setTab] = useState<Tab>("todos");
  const [search, setSearch] = useState("");
  const [procesando, setProcesando] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState<{ id: string; accion: string } | null>(null);
  const [panelPaciente, setPanelPaciente] = useState<Paciente | null>(null);
  const [duracion, setDuracion] = useState<string>("7d");
  const [mensaje, setMensaje] = useState<{ texto: string; tipo: "ok" | "error" } | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(totalInicial);
  const pageSize = 50;
  const totalPages = Math.ceil(total / pageSize);

  const filtered = pacientes.filter((p) => {
    if (tab === "pausado" && (p.estado_cuenta ?? "activo") !== "pausado") return false;
    if (tab === "bloqueado" && (p.estado_cuenta ?? "activo") !== "bloqueado") return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      p.nombre_completo?.toLowerCase().includes(q) ||
      p.email?.toLowerCase().includes(q) ||
      p.dni?.includes(q)
    );
  });

  async function buscarServer(p?: number) {
    const targetPage = p ?? page;
    setBuscando(true);
    try {
      const params = new URLSearchParams({ page: targetPage.toString(), pageSize: pageSize.toString() });
      if (search) params.set("q", search);
      if (tab !== "todos") params.set("estado", tab);
      const res = await fetch(`/api/admin/pacientes?${params}`);
      const data = await res.json();
      if (data.pacientes) {
        setPacientes(data.pacientes);
        setTotal(data.total ?? 0);
        setPage(targetPage);
      }
    } catch { /* ignore */ }
    setBuscando(false);
  }

  function irAPagina(p: number) {
    if (p < 1 || p > totalPages) return;
    buscarServer(p);
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

      {/* Tabs */}
      <div className="mt-5 flex gap-1 border-b border-gray-200">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === key
                ? "text-[#378ADD] border-b-2 border-[#378ADD]"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative mt-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && buscarServer()}
          placeholder="Buscar por nombre, email o DNI (Enter para buscar en servidor)..."
          className="w-full rounded-lg border border-gray-200 bg-white py-2.5 pl-9 pr-4 text-sm text-gray-700 placeholder-gray-400 focus:border-[#378ADD] focus:outline-none focus:ring-1 focus:ring-[#378ADD]"
        />
        {buscando && <Loader2 size={16} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-gray-400" />}
      </div>

      {mensaje && (
        <p className={`mt-3 text-center text-sm ${mensaje.tipo === "ok" ? "text-[#1D9E75]" : "text-[#E24B4A]"}`}>
          {mensaje.texto}
        </p>
      )}

      {/* Table */}
      <div className="mt-4 overflow-hidden rounded-xl bg-white" style={{ border: "1px solid #e5e7eb" }}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs font-medium uppercase tracking-wide text-gray-400">
              <th className="px-4 py-3">Paciente</th>
              <th className="hidden px-4 py-3 lg:table-cell">Email</th>
              <th className="hidden px-4 py-3 lg:table-cell">Registro</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                  No se encontraron pacientes
                </td>
              </tr>
            )}
            {filtered.map((p) => {
              const estado = p.estado_cuenta ?? "activo";
              return (
                <tr key={p.id} className="hover:bg-gray-50/50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{p.nombre_completo || "Sin nombre"}</p>
                    <p className="text-xs text-gray-400 lg:hidden">{p.email}</p>
                  </td>
                  <td className="hidden px-4 py-3 text-gray-600 lg:table-cell">{p.email || "—"}</td>
                  <td className="hidden px-4 py-3 text-gray-500 lg:table-cell">
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

      {/* Paginacion */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-xs text-gray-400">
            {total} pacientes · Pagina {page} de {totalPages}
          </p>
          <div className="flex gap-1">
            <button
              onClick={() => irAPagina(page - 1)}
              disabled={page <= 1 || buscando}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 disabled:opacity-30 hover:bg-gray-50"
            >
              Anterior
            </button>
            {[...Array(Math.min(totalPages, 5))].map((_, i) => {
              const p = page <= 3 ? i + 1 : page - 2 + i;
              if (p > totalPages) return null;
              return (
                <button
                  key={p}
                  onClick={() => irAPagina(p)}
                  disabled={buscando}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                    p === page
                      ? "bg-[#378ADD] text-white"
                      : "border border-gray-200 text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {p}
                </button>
              );
            })}
            <button
              onClick={() => irAPagina(page + 1)}
              disabled={page >= totalPages || buscando}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 disabled:opacity-30 hover:bg-gray-50"
            >
              Siguiente
            </button>
          </div>
        </div>
      )}

      {/* Confirm dialogs */}
      {confirmando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20" onClick={() => setConfirmando(null)}>
          <div className="mx-4 w-full max-w-md rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            {confirmando.accion === "pausar" && (
              <>
                <p className="text-sm font-medium text-gray-900">¿Pausar paciente?</p>
                <p className="mt-1 text-xs text-gray-500">El paciente no podrá iniciar nuevas consultas.</p>
                <div className="mt-3 flex gap-2">
                  {["7d", "30d", "indefinido"].map((d) => (
                    <button
                      key={d}
                      onClick={() => setDuracion(d)}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                        duracion === d ? "border-[#378ADD] bg-[#378ADD]/10 text-[#378ADD]" : "border-gray-200 text-gray-500 hover:bg-gray-50"
                      }`}
                    >
                      {d === "7d" ? "7 días" : d === "30d" ? "30 días" : "Indefinido"}
                    </button>
                  ))}
                </div>
                <ConfirmDialog
                  title=""
                  confirmLabel="Pausar"
                  variant="warning"
                  requireReason
                  reasonPlaceholder="Motivo de la pausa..."
                  onConfirm={(motivo) => handleAccion(confirmando.id, "pausar", motivo)}
                  onCancel={() => setConfirmando(null)}
                  isLoading={procesando === confirmando.id}
                />
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
                reasonPlaceholder="Motivo de la reactivacion (min 10 caracteres)..."
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
        {panelPaciente && <PacienteDetalle paciente={panelPaciente} />}
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
