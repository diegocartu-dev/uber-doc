"use client";

import { useState } from "react";
import { CheckCircle, XCircle, ExternalLink, FileText, Copy, Loader2, Search, Eye, Ban, RotateCcw } from "lucide-react";
import StatusBadge from "../components/StatusBadge";
import ConfirmDialog from "../components/ConfirmDialog";
import SidePanel from "../components/SidePanel";

interface Medico {
  id: string;
  nombre_completo: string;
  email: string;
  dni: string | null;
  tipo_matricula: string;
  numero_matricula: string;
  provincia_matricula: string | null;
  especialidad: string;
  foto_credencial_url: string | null;
  estado_registro: string;
  created_at: string;
  cuit: string | null;
  user_id: string;
  domicilio: string | null;
  verificado: boolean;
  verificado_at: string | null;
  verificado_por: string | null;
  disponible: boolean;
  notas_admin: string | null;
  slug: string | null;
}

type Tab = "pendiente_revision" | "aprobado" | "rechazado" | "suspendido";

const TABS: { key: Tab; label: string }[] = [
  { key: "pendiente_revision", label: "Pendientes" },
  { key: "aprobado", label: "Aprobados" },
  { key: "rechazado", label: "Rechazados" },
  { key: "suspendido", label: "Suspendidos" },
];

export default function MedicosClient({ medicos: initial }: { medicos: Medico[] }) {
  const [medicos, setMedicos] = useState(initial);
  const [tab, setTab] = useState<Tab>("pendiente_revision");
  const [search, setSearch] = useState("");
  const [procesando, setProcesando] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState<{ id: string; accion: string } | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);
  const [panelMedico, setPanelMedico] = useState<Medico | null>(null);
  const [mensaje, setMensaje] = useState<{ texto: string; tipo: "ok" | "error" } | null>(null);

  const filtered = medicos.filter((m) => {
    if (m.estado_registro !== tab) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      m.nombre_completo.toLowerCase().includes(q) ||
      m.email.toLowerCase().includes(q) ||
      m.numero_matricula.includes(q) ||
      (m.dni && m.dni.includes(q))
    );
  });

  const counts = {
    pendiente_revision: medicos.filter((m) => m.estado_registro === "pendiente_revision").length,
    aprobado: medicos.filter((m) => m.estado_registro === "aprobado").length,
    rechazado: medicos.filter((m) => m.estado_registro === "rechazado").length,
    suspendido: medicos.filter((m) => m.estado_registro === "suspendido").length,
  };

  async function handleAccion(medicoId: string, accion: string, motivo?: string) {
    setProcesando(medicoId);
    setMensaje(null);
    try {
      const res = await fetch("/api/admin/medicos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ medicoId, accion, motivo }),
      });
      const data = await res.json();
      if (data.ok) {
        setMedicos((prev) =>
          prev.map((m) =>
            m.id === medicoId
              ? { ...m, estado_registro: data.estado, verificado: data.estado === "aprobado", notas_admin: motivo ?? m.notas_admin }
              : m
          )
        );
        setMensaje({ texto: `${accion.charAt(0).toUpperCase() + accion.slice(1)} exitoso`, tipo: "ok" });
      } else {
        setMensaje({ texto: data.error || "Error", tipo: "error" });
      }
    } catch {
      setMensaje({ texto: "Error de conexión", tipo: "error" });
    }
    setProcesando(null);
    setConfirmando(null);
  }

  async function copiarMatricula(tipo: string, numero: string, id: string) {
    await navigator.clipboard.writeText(`${tipo} ${numero}`);
    setCopiado(id);
    setTimeout(() => setCopiado(null), 2000);
  }

  return (
    <div className="p-6 lg:p-8">
      <h1 className="text-xl font-semibold text-gray-900">Médicos</h1>

      {/* Tabs */}
      <div className="mt-5 flex gap-1 border-b border-gray-200">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`relative px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === key
                ? "text-[#378ADD] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-[#378ADD]"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {label}
            {counts[key] > 0 && (
              <span className={`ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold ${
                key === "pendiente_revision" ? "bg-[#E24B4A] text-white" : "bg-gray-100 text-gray-600"
              }`}>
                {counts[key]}
              </span>
            )}
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
          placeholder="Buscar por nombre, email, matrícula o DNI..."
          className="w-full rounded-lg border border-gray-200 bg-white py-2.5 pl-9 pr-4 text-sm text-gray-700 placeholder-gray-400 focus:border-[#378ADD] focus:outline-none focus:ring-1 focus:ring-[#378ADD]"
        />
      </div>

      {/* Message */}
      {mensaje && (
        <p className={`mt-3 text-center text-sm ${mensaje.tipo === "ok" ? "text-[#1D9E75]" : "text-[#E24B4A]"}`}>
          {mensaje.texto}
        </p>
      )}

      {/* List */}
      <div className="mt-4 space-y-4">
        {filtered.length === 0 && (
          <div className="rounded-xl bg-white p-8 text-center" style={{ border: "1px solid #e5e7eb" }}>
            <p className="text-gray-500">
              {search ? "No se encontraron resultados" : `No hay médicos ${TABS.find((t) => t.key === tab)?.label.toLowerCase()}`}
            </p>
          </div>
        )}

        {tab === "pendiente_revision"
          ? filtered.map((m) => (
              <PendienteCard
                key={m.id}
                medico={m}
                procesando={procesando === m.id}
                confirmando={confirmando?.id === m.id ? confirmando.accion : null}
                copiado={copiado === m.id}
                onAprobar={() => handleAccion(m.id, "aprobar")}
                onRechazar={(motivo) => handleAccion(m.id, "rechazar", motivo)}
                onStartConfirm={(accion) => setConfirmando({ id: m.id, accion })}
                onCancelConfirm={() => setConfirmando(null)}
                onCopiar={() => copiarMatricula(m.tipo_matricula, m.numero_matricula, m.id)}
              />
            ))
          : filtered.map((m) => (
              <MedicoRow
                key={m.id}
                medico={m}
                procesando={procesando === m.id}
                confirmando={confirmando?.id === m.id ? confirmando.accion : null}
                onAccion={(accion, motivo) => handleAccion(m.id, accion, motivo)}
                onStartConfirm={(accion) => setConfirmando({ id: m.id, accion })}
                onCancelConfirm={() => setConfirmando(null)}
                onVerPerfil={() => setPanelMedico(m)}
              />
            ))
        }
      </div>

      {/* Side panel */}
      <SidePanel
        open={!!panelMedico}
        onClose={() => setPanelMedico(null)}
        title={panelMedico?.nombre_completo ?? ""}
      >
        {panelMedico && <MedicoDetalle medico={panelMedico} />}
      </SidePanel>
    </div>
  );
}

function PendienteCard({
  medico: m,
  procesando,
  confirmando,
  copiado,
  onAprobar,
  onRechazar,
  onStartConfirm,
  onCancelConfirm,
  onCopiar,
}: {
  medico: Medico;
  procesando: boolean;
  confirmando: string | null;
  copiado: boolean;
  onAprobar: () => void;
  onRechazar: (motivo: string) => void;
  onStartConfirm: (accion: string) => void;
  onCancelConfirm: () => void;
  onCopiar: () => void;
}) {
  return (
    <div className="rounded-xl bg-white p-5" style={{ border: "1px solid #e5e7eb" }}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-gray-900">{m.nombre_completo}</h3>
          <p className="mt-0.5 text-sm text-gray-500">{m.especialidad}</p>
        </div>
        <StatusBadge status="pendiente_revision" />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
        <Field label="Email" value={m.email} />
        <Field label="DNI" value={m.dni} />
        <Field label="Matrícula" value={`${m.tipo_matricula} ${m.numero_matricula}${m.provincia_matricula ? ` (${m.provincia_matricula})` : ""}`} />
        <Field label="CUIT" value={m.cuit} />
        <Field label="Domicilio" value={m.domicilio} />
        <Field label="Registro" value={new Date(m.created_at).toLocaleDateString("es-AR")} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <a
          href="https://sisa.msal.gov.ar/refeps"
          target="_blank"
          rel="noopener noreferrer"
          onClick={onCopiar}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-50"
        >
          {copiado ? (
            <><CheckCircle size={14} className="text-[#1D9E75]" /> Matrícula copiada</>
          ) : (
            <><ExternalLink size={14} /> Verificar en REFEPS <Copy size={12} className="text-gray-400" /></>
          )}
        </a>
        {m.foto_credencial_url && (
          <button
            onClick={() => window.open(`/api/admin/credencial?path=${encodeURIComponent(m.foto_credencial_url!)}`, "_blank")}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-50"
          >
            <FileText size={14} /> Ver credencial
          </button>
        )}
      </div>

      {confirmando === "rechazar" ? (
        <ConfirmDialog
          title={`¿Rechazar el registro de ${m.nombre_completo}?`}
          description="El médico recibirá una notificación de rechazo."
          confirmLabel="Sí, rechazar"
          variant="danger"
          requireReason
          reasonPlaceholder="Motivo del rechazo..."
          onConfirm={(motivo) => onRechazar(motivo!)}
          onCancel={onCancelConfirm}
          isLoading={procesando}
        />
      ) : (
        <div className="mt-4 flex gap-3 border-t border-gray-100 pt-4">
          <button
            onClick={onAprobar}
            disabled={procesando}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#378ADD] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#2d75c4] active:scale-[0.97] disabled:opacity-50"
          >
            {procesando ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
            Aprobar
          </button>
          <button
            onClick={() => onStartConfirm("rechazar")}
            disabled={procesando}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-[#E24B4A] px-4 py-2.5 text-sm font-medium text-[#E24B4A] transition hover:bg-red-50 active:scale-[0.97] disabled:opacity-50"
          >
            <XCircle size={16} />
            Rechazar
          </button>
        </div>
      )}
    </div>
  );
}

function MedicoRow({
  medico: m,
  procesando,
  confirmando,
  onAccion,
  onStartConfirm,
  onCancelConfirm,
  onVerPerfil,
}: {
  medico: Medico;
  procesando: boolean;
  confirmando: string | null;
  onAccion: (accion: string, motivo?: string) => void;
  onStartConfirm: (accion: string) => void;
  onCancelConfirm: () => void;
  onVerPerfil: () => void;
}) {
  return (
    <div className="rounded-xl bg-white p-5" style={{ border: "1px solid #e5e7eb" }}>
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-gray-900">{m.nombre_completo}</h3>
            <StatusBadge status={m.estado_registro} />
          </div>
          <p className="mt-0.5 text-xs text-gray-500">
            {m.especialidad} · {m.tipo_matricula} {m.numero_matricula} · {m.email}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onVerPerfil}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-50"
          >
            <Eye size={14} /> Ver perfil
          </button>
          {m.estado_registro === "aprobado" && (
            <button
              onClick={() => onStartConfirm("suspender")}
              disabled={procesando}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#D85A30] px-3 py-1.5 text-xs font-medium text-[#D85A30] transition hover:bg-orange-50 disabled:opacity-50"
            >
              <Ban size={14} /> Suspender
            </button>
          )}
          {(m.estado_registro === "suspendido" || m.estado_registro === "rechazado") && (
            <button
              onClick={() => onAccion("reactivar")}
              disabled={procesando}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#1D9E75] px-3 py-1.5 text-xs font-medium text-[#1D9E75] transition hover:bg-emerald-50 disabled:opacity-50"
            >
              {procesando ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
              Reactivar
            </button>
          )}
        </div>
      </div>

      {m.notas_admin && (
        <p className="mt-2 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">
          <span className="font-medium text-gray-600">Nota:</span> {m.notas_admin}
        </p>
      )}

      {confirmando === "suspender" && (
        <ConfirmDialog
          title={`¿Suspender a ${m.nombre_completo}?`}
          description="El médico no podrá atender ni aparecer en búsquedas."
          confirmLabel="Sí, suspender"
          variant="warning"
          requireReason
          reasonPlaceholder="Motivo de la suspensión..."
          onConfirm={(motivo) => onAccion("suspender", motivo)}
          onCancel={onCancelConfirm}
          isLoading={procesando}
        />
      )}
    </div>
  );
}

function MedicoDetalle({ medico: m }: { medico: Medico }) {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Información personal</p>
        <div className="mt-3 space-y-2 text-sm">
          <Field label="Nombre" value={m.nombre_completo} />
          <Field label="Email" value={m.email} />
          <Field label="DNI" value={m.dni} />
          <Field label="CUIT" value={m.cuit} />
          <Field label="Domicilio" value={m.domicilio} />
        </div>
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Matrícula</p>
        <div className="mt-3 space-y-2 text-sm">
          <Field label="Tipo" value={m.tipo_matricula} />
          <Field label="Número" value={m.numero_matricula} />
          <Field label="Provincia" value={m.provincia_matricula} />
          <Field label="Especialidad" value={m.especialidad} />
        </div>
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Estado</p>
        <div className="mt-3 space-y-2 text-sm">
          <div><span className="text-gray-400">Estado:</span> <StatusBadge status={m.estado_registro} /></div>
          <Field label="Disponible" value={m.disponible ? "Sí" : "No"} />
          <Field label="Verificado por" value={m.verificado_por} />
          <Field label="Verificado el" value={m.verificado_at ? new Date(m.verificado_at).toLocaleDateString("es-AR") : null} />
          <Field label="Registro" value={new Date(m.created_at).toLocaleDateString("es-AR")} />
        </div>
      </div>
      {m.notas_admin && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Notas admin</p>
          <p className="mt-2 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-600">{m.notas_admin}</p>
        </div>
      )}
      {m.foto_credencial_url && (
        <button
          onClick={() => window.open(`/api/admin/credencial?path=${encodeURIComponent(m.foto_credencial_url!)}`, "_blank")}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
        >
          <FileText size={16} /> Ver credencial
        </button>
      )}
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
