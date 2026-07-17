"use client";

import { useState } from "react";
import { CheckCircle, XCircle, ExternalLink, FileText, Loader2, Search, Eye, Ban, RotateCcw, ShieldCheck, ShieldAlert, LogIn, Clock } from "lucide-react";
import StatusBadge from "../components/StatusBadge";
import ConfirmDialog from "../components/ConfirmDialog";
import SidePanel from "../components/SidePanel";
import { normalizarJurisdiccion } from "@/lib/jurisdicciones";

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
  categoria: string | null;
  refeps_validado: boolean | null;
  refeps_data: Record<string, unknown> | null;
  refeps_validado_at: string | null;
  jurisdicciones: string[] | null;
  identidad_validada: boolean | null;
  biometria_exenta: boolean | null;
  didit_status: string | null;
  // Estado de onboarding (lo calcula el API): qué le falta para poder atender.
  faltantes?: string[];
  faltantesCount?: number;
  totalRequisitos?: number;
  criticosFaltantes?: string[];
  sinEmpezar?: boolean;
  listoParaAtender?: boolean;
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
  const [panelMedico, setPanelMedico] = useState<Medico | null>(null);
  const [mensaje, setMensaje] = useState<{ texto: string; tipo: "ok" | "error" } | null>(null);
  const [filtroCategoria, setFiltroCategoria] = useState<string | null>(null);

  const filtered = medicos.filter((m) => {
    if (m.estado_registro !== tab) return false;
    if (filtroCategoria && m.categoria !== filtroCategoria) return false;
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

  // Tras una validación REFEPS manual (red de respaldo), reflejar el resultado en la
  // lista para que la card y el diálogo de aprobar muestren el estado fresco.
  function actualizarRefeps(
    medicoId: string,
    validado: boolean,
    data: Record<string, unknown> | null,
    jurisdicciones?: string[]
  ) {
    setMedicos((prev) =>
      prev.map((m) =>
        m.id === medicoId
          ? { ...m, refeps_validado: validado, refeps_data: data, ...(jurisdicciones?.length ? { jurisdicciones } : {}) }
          : m
      )
    );
  }

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
        // Abrir en nueva pestaña para no perder sesión admin
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

      {/* Filtro categoria - solo en tab aprobado */}
      {tab === "aprobado" && (
        <div className="mt-3 flex gap-2">
          {[
            { key: null, label: "Todos" },
            { key: "founder", label: "Founder" },
            { key: "tradicional", label: "Tradicional" },
          ].map(({ key, label }) => {
            const count = key
              ? medicos.filter((m) => m.estado_registro === "aprobado" && m.categoria === key).length
              : medicos.filter((m) => m.estado_registro === "aprobado").length;
            return (
              <button
                key={label}
                onClick={() => setFiltroCategoria(key)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  filtroCategoria === key
                    ? "bg-[#378ADD] text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {label} ({count})
              </button>
            );
          })}
        </div>
      )}

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
                onAprobar={() => handleAccion(m.id, "aprobar")}
                onRechazar={(motivo) => handleAccion(m.id, "rechazar", motivo)}
                onStartConfirm={(accion) => setConfirmando({ id: m.id, accion })}
                onCancelConfirm={() => setConfirmando(null)}
                onImpersonate={() => handleImpersonate(m.user_id, m.nombre_completo)}
                onRefepsActualizado={(validado, data, juris) => actualizarRefeps(m.id, validado, data, juris)}
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
                onImpersonate={() => handleImpersonate(m.user_id, m.nombre_completo)}
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
        {panelMedico && <MedicoDetalle medico={panelMedico} onImpersonate={() => handleImpersonate(panelMedico.user_id, panelMedico.nombre_completo)} />}
      </SidePanel>
    </div>
  );
}

// Errores de SISTEMA del Bus (timeout/caído): el resultado NO es definitivo — la
// validación automática (registro + cron) lo va a reintentar sola.
const REFEPS_ERRORES_SISTEMA = new Set(["REFEPS_TIMEOUT", "REFEPS_AUTH_ERROR", "REFEPS_ERROR_INTERNO"]);

// Estado ternario ÚNICO — lo leen la card Y el diálogo de aprobar, para que nunca
// cuenten historias distintas (gate Sofía #250).
function estadoRefeps(m: Pick<Medico, "refeps_validado" | "refeps_data">): "ok" | "no" | "pendiente" {
  if (m.refeps_validado === true) return "ok";
  const rd = m.refeps_data as { error?: string } | null;
  if (!rd || (rd.error ? REFEPS_ERRORES_SISTEMA.has(rd.error) : false)) return "pendiente";
  return "no";
}

// Jurisdicciones habilitadas para mostrar: preferir la columna derivada; si no, sacarlas
// de las matrículas habilitadas del resultado REFEPS, normalizadas a la lista canónica
// (sin normalizar podría mostrar "Provincial", que no es una jurisdicción).
function jurisdiccionesDe(m: { jurisdicciones: string[] | null; refeps_data: Record<string, unknown> | null }): string[] {
  if (m.jurisdicciones?.length) return m.jurisdicciones;
  const mats = (m.refeps_data as { matriculas?: Array<{ tipo?: string; habilitada?: boolean }> } | null)?.matriculas;
  return [...new Set(
    (mats ?? []).filter((x) => x.habilitada).map((x) => normalizarJurisdiccion(x.tipo)).filter((j): j is NonNullable<typeof j> => !!j)
  )];
}

// Estado REFEPS resuelto de antemano (la validación corre sola al registrarse + cron cada
// 10min/6h). El admin se encuentra al médico YA verificado o no; el botón manual es SOLO
// la red para cuando la automática no pudo correr (Bus del Ministerio caído).
function BloqueRefeps({
  medico: m,
  onResultado,
}: {
  medico: Medico;
  onResultado: (validado: boolean, data: Record<string, unknown> | null, jurisdicciones?: string[]) => void;
}) {
  const [validando, setValidando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rd = m.refeps_data as { error?: string; encontrado?: boolean; activo?: boolean } | null;
  const estado = estadoRefeps(m);

  async function validarAhora() {
    setValidando(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/medicos/refeps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ medicoId: m.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Error desconocido");
        return;
      }
      const juris = [...new Set(((data.resultado?.matriculas ?? []) as Array<{ tipo?: string; habilitada?: boolean }>)
        .filter((x) => x.habilitada).map((x) => x.tipo).filter((t): t is string => !!t))];
      onResultado(data.refeps_validado, data.resultado ?? null, juris);
    } catch {
      setError("Error de conexión");
    } finally {
      setValidando(false);
    }
  }

  if (estado === "ok") {
    const juris = jurisdiccionesDe(m);
    return (
      <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-3">
        <div className="flex items-center gap-2 text-sm font-medium text-green-800">
          <ShieldCheck size={16} /> Verificado en REFEPS — matrícula activa
        </div>
        {juris.length > 0 ? (
          <p className="mt-1 text-xs text-green-700">
            Habilitado para atender en: <strong>{juris.join(", ")}</strong>
          </p>
        ) : (
          // Fail-open de la clínica: sin jurisdicciones derivadas, el médico aparece para
          // TODAS las provincias. La aprobación es el momento de enterarse y resolverlo.
          <p className="mt-1 text-xs text-amber-700">
            Sin jurisdicciones derivadas de REFEPS — va a aparecer para pacientes de todas las provincias hasta resolverlo.
          </p>
        )}
      </div>
    );
  }

  if (estado === "no") {
    // "No" definitivo: no figura / matrícula inactiva / sin matrícula registrada.
    const detalle =
      rd?.encontrado && rd?.activo === false
        ? "La matrícula figura INACTIVA en REFEPS."
        : rd?.error === "SIN_MATRICULA_REGISTRADA"
          ? "Figura en REFEPS pero sin matrícula registrada."
          : rd?.error === "REGISTRO_NO_ENCONTRADO"
            ? "El DNI no tiene matrícula registrada en REFEPS."
            : `REFEPS no pudo verificar la matrícula${rd?.error ? ` (código: ${rd.error})` : ""}.`;
    return (
      <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
        <div className="flex items-center gap-2 text-sm font-medium text-amber-800">
          <ShieldAlert size={16} /> No verificado en REFEPS
        </div>
        <p className="mt-1 text-xs text-amber-700">{detalle} No se puede aprobar así.</p>
        <p className="mt-1 text-xs text-amber-700">
          Compará el DNI con la credencial: si está mal cargado, re-verificar no cambia nada.
        </p>
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
        <div className="mt-2 flex items-center gap-3">
          <button
            onClick={validarAhora}
            disabled={validando || !m.dni}
            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-medium text-amber-800 transition hover:bg-amber-100 disabled:opacity-50"
          >
            {validando ? <><Loader2 size={13} className="animate-spin" /> Re-verificando…</> : <>Re-verificar en REFEPS</>}
          </button>
          <a
            href="https://sisa.msal.gov.ar/refeps"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-amber-800 underline"
          >
            <ExternalLink size={12} /> Ver en SISA
          </a>
        </div>
      </div>
    );
  }

  // Pendiente: la automática no llegó a un resultado (Bus caído/lento). Acá SÍ tiene
  // sentido el botón manual — es la única situación en la que el admin aprieta algo.
  return (
    <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
      <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
        {validando ? <Loader2 size={16} className="animate-spin" /> : <Clock size={16} />} Verificación REFEPS pendiente
      </div>
      <p className="mt-1 text-xs text-gray-500">
        {rd?.error ? "El registro del Ministerio no respondió; se reintenta solo (10 min la primera hora, después cada 6 h)." : "La verificación automática todavía no corrió."}
      </p>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      <button
        onClick={validarAhora}
        disabled={validando || !m.dni}
        className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-[#378ADD] px-3 py-1.5 text-xs font-medium text-[#378ADD] transition hover:bg-blue-50 disabled:opacity-50"
      >
        {validando ? <><Loader2 size={13} className="animate-spin" /> Verificando…</> : <><ShieldCheck size={13} /> Verificar ahora</>}
      </button>
      {!m.dni && <p className="mt-1 text-xs text-gray-400">El médico no tiene DNI cargado</p>}
    </div>
  );
}

function PendienteCard({
  medico: m,
  procesando,
  confirmando,
  onAprobar,
  onRechazar,
  onStartConfirm,
  onCancelConfirm,
  onImpersonate,
  onRefepsActualizado,
}: {
  medico: Medico;
  procesando: boolean;
  confirmando: string | null;
  onAprobar: () => void;
  onRechazar: (motivo: string) => void;
  onStartConfirm: (accion: string) => void;
  onCancelConfirm: () => void;
  onImpersonate: () => void;
  onRefepsActualizado: (validado: boolean, data: Record<string, unknown> | null, jurisdicciones?: string[]) => void;
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

      <BloqueRefeps medico={m} onResultado={onRefepsActualizado} />

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {m.foto_credencial_url && (
          <button
            onClick={() => window.open(`/api/admin/credencial?path=${encodeURIComponent(m.foto_credencial_url!)}`, "_blank")}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-50"
          >
            <FileText size={14} /> Ver credencial
          </button>
        )}
        <button
          onClick={onImpersonate}
          disabled={procesando}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[#378ADD] px-3 py-1.5 text-xs font-medium text-[#378ADD] transition hover:bg-blue-50 disabled:opacity-50"
        >
          <LogIn size={14} /> Ingresar como médico
        </button>
      </div>

      {confirmando === "aprobar" ? (
        <ConfirmDialog
          title={`Aprobar a ${m.nombre_completo}?`}
          description={`${
            // Guard anti aprobación-a-ciegas (Diego 17/07, caso real: se aprobó
            // una médica con identidad Declined sin que el panel lo mostrara).
            m.didit_status === "Declined" && !m.identidad_validada && !m.biometria_exenta
              ? "⚠️ IDENTIDAD RECHAZADA POR DIDIT: el cruce biométrico (cara + DNI) falló. Podés aprobar igual, pero revisá la credencial y el caso antes. "
              : ""
          }${m.especialidad} — ${m.tipo_matricula} ${m.numero_matricula}. ${
            estadoRefeps(m) === "ok"
              ? `REFEPS OK${jurisdiccionesDe(m).length ? ` — habilitado en ${jurisdiccionesDe(m).join(", ")}` : ""}.`
              : estadoRefeps(m) === "no"
                ? "REFEPS dice que la matrícula no figura o está inactiva. Al aprobar se re-verifica contra el registro; si sigue igual, la aprobación se bloquea."
                : "REFEPS todavía sin resultado: se verifica en este paso y se bloquea si no figura."
          } El medico podra atender pacientes en la plataforma.`}
          confirmLabel={
            m.didit_status === "Declined" && !m.identidad_validada && !m.biometria_exenta
              ? "Aprobar igual (identidad rechazada)"
              : "Si, aprobar"
          }
          variant={
            m.didit_status === "Declined" && !m.identidad_validada && !m.biometria_exenta
              ? "danger"
              : "primary"
          }
          onConfirm={() => onAprobar()}
          onCancel={onCancelConfirm}
          isLoading={procesando}
        />
      ) : confirmando === "rechazar" ? (
        <ConfirmDialog
          title={`Rechazar el registro de ${m.nombre_completo}?`}
          description="El medico recibira una notificacion de rechazo."
          confirmLabel="Si, rechazar"
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
            onClick={() => onStartConfirm("aprobar")}
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
  onImpersonate,
}: {
  medico: Medico;
  procesando: boolean;
  confirmando: string | null;
  onAccion: (accion: string, motivo?: string) => void;
  onStartConfirm: (accion: string) => void;
  onCancelConfirm: () => void;
  onVerPerfil: () => void;
  onImpersonate: () => void;
}) {
  return (
    <div className="rounded-xl bg-white p-5" style={{ border: "1px solid #e5e7eb" }}>
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-gray-900">{m.nombre_completo}</h3>
            <StatusBadge status={m.estado_registro} />
            {m.categoria && (
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                m.categoria === "founder"
                  ? "bg-blue-50 text-[#378ADD]"
                  : "bg-gray-100 text-gray-600"
              }`}>
                {m.categoria === "founder" ? "Founder" : "Tradicional"}
              </span>
            )}
            {/* Estado de onboarding: ¿puede atender? (verde = indicador de estado;
                #0F6E56 / #854F0B = variantes de contraste del verde/ámbar de estado) */}
            {m.estado_registro === "aprobado" && m.faltantesCount !== undefined && (
              m.listoParaAtender ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-[#1D9E75]/10 px-2 py-0.5 text-[10px] font-medium text-[#0F6E56]">
                  <CheckCircle size={11} /> Listo para atender{m.disponible ? " · disponible ahora" : ""}
                </span>
              ) : (
                <span
                  title={m.faltantes?.join(", ")}
                  className="inline-flex items-center gap-1 rounded-full bg-[#BA7517]/10 px-2 py-0.5 text-[10px] font-medium text-[#854F0B]"
                >
                  <ShieldAlert size={11} />
                  {m.sinEmpezar
                    ? "No puede atender · perfil sin empezar"
                    : `No puede atender · faltan ${m.faltantesCount} de ${m.totalRequisitos}${m.criticosFaltantes && m.criticosFaltantes.length ? ` · ${m.criticosFaltantes.join(", ")}` : ""}`}
                </span>
              )
            )}
            {/* Identidad biométrica (Didit) — aviso al admin en el panel, sin mails.
                Verde=validada (estado OK), gris=exenta, rojo=rechazada por Didit,
                ámbar=pendiente (aún no la completó). TAMBIÉN en Pendientes (Diego
                17/07): el dato existe ANTES de aprobar y esconderlo produjo una
                aprobación a ciegas con identidad rechazada. */}
            {(m.estado_registro === "aprobado" || m.estado_registro === "pendiente_revision") && (
              m.identidad_validada ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-[#1D9E75]/10 px-2 py-0.5 text-[10px] font-medium text-[#0F6E56]">
                  <CheckCircle size={11} /> Identidad ✓
                </span>
              ) : m.biometria_exenta ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">
                  Identidad exenta
                </span>
              ) : m.didit_status === "Declined" ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-[#E24B4A]/10 px-2 py-0.5 text-[10px] font-medium text-[#B03231]">
                  <ShieldAlert size={11} /> Identidad rechazada — revisar
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-[#BA7517]/10 px-2 py-0.5 text-[10px] font-medium text-[#854F0B]">
                  <ShieldAlert size={11} /> Identidad pendiente
                </span>
              )
            )}
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
          <button
            onClick={onImpersonate}
            disabled={procesando}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#378ADD] px-3 py-1.5 text-xs font-medium text-[#378ADD] transition hover:bg-blue-50 disabled:opacity-50"
          >
            <LogIn size={14} /> Ingresar como médico
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
              onClick={() => onStartConfirm("reactivar")}
              disabled={procesando}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#378ADD] px-3 py-1.5 text-xs font-medium text-[#378ADD] transition hover:bg-blue-50 disabled:opacity-50"
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
          title={`Suspender a ${m.nombre_completo}?`}
          description="El medico no podra atender ni aparecer en busquedas."
          confirmLabel="Si, suspender"
          variant="warning"
          requireReason
          reasonPlaceholder="Motivo de la suspension..."
          onConfirm={(motivo) => onAccion("suspender", motivo)}
          onCancel={onCancelConfirm}
          isLoading={procesando}
        />
      )}

      {confirmando === "reactivar" && (
        <ConfirmDialog
          title={`Reactivar a ${m.nombre_completo}?`}
          description="El medico volvera a poder atender y aparecer en busquedas."
          confirmLabel="Si, reactivar"
          variant="primary"
          requireReason
          minReasonLength={10}
          reasonPlaceholder="Motivo de la reactivacion..."
          onConfirm={(motivo) => onAccion("reactivar", motivo)}
          onCancel={onCancelConfirm}
          isLoading={procesando}
        />
      )}
    </div>
  );
}

function MedicoDetalle({ medico: m, onImpersonate }: { medico: Medico; onImpersonate: () => void }) {
  const [validando, setValidando] = useState(false);
  const [refepsResult, setRefepsResult] = useState<Record<string, unknown> | null>(m.refeps_data);
  const [refepsValidado, setRefepsValidado] = useState(m.refeps_validado);
  const [refepsError, setRefepsError] = useState<string | null>(null);

  async function handleValidarRefeps() {
    setValidando(true);
    setRefepsError(null);
    try {
      const res = await fetch("/api/admin/medicos/refeps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ medicoId: m.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setRefepsError(data.error || "Error desconocido");
        return;
      }
      setRefepsResult(data.resultado);
      setRefepsValidado(data.refeps_validado);
    } catch {
      setRefepsError("Error de conexión");
    } finally {
      setValidando(false);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rd = refepsResult as any;
  const matriculasRefeps = rd?.matriculas as Array<{
    numero: string;
    tipo: string;
    entidad_certificante: string;
    habilitada?: boolean;
  }> | undefined;

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

      {/* REFEPS Validation */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Validación REFEPS</p>
        <div className="mt-3">
          {refepsValidado ? (
            <div className="rounded-lg border border-green-200 bg-green-50 p-3">
              <div className="flex items-center gap-2 text-sm font-medium text-green-800">
                <ShieldCheck size={16} />
                Matrícula verificada en REFEPS
              </div>
              {matriculasRefeps && matriculasRefeps.length > 0 && (
                <div className="mt-2 space-y-1">
                  {matriculasRefeps.map((mat, i) => (
                    <p key={i} className="text-xs text-green-700">
                      {mat.habilitada ? "✓" : "✗"} Matrícula {mat.numero} — {mat.tipo}
                      {mat.entidad_certificante ? ` (${mat.entidad_certificante})` : ""}
                    </p>
                  ))}
                </div>
              )}
              {m.refeps_validado_at && (
                <p className="mt-2 text-xs text-green-600">
                  Validado: {new Date(m.refeps_validado_at).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                </p>
              )}
            </div>
          ) : refepsResult && !refepsValidado ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <div className="flex items-center gap-2 text-sm font-medium text-amber-800">
                <ShieldAlert size={16} />
                No encontrado en REFEPS
              </div>
              <p className="mt-1 text-xs text-amber-700">
                {rd?.error === "REGISTRO_NO_ENCONTRADO"
                  ? "El DNI no tiene matrícula registrada en REFEPS"
                  : rd?.error || "Error en la validación"}
              </p>
            </div>
          ) : null}

          {refepsError && (
            <p className="mt-2 text-xs text-red-600">{refepsError}</p>
          )}

          <button
            onClick={handleValidarRefeps}
            disabled={validando || !m.dni}
            className="mt-3 inline-flex items-center gap-2 rounded-lg border border-[#378ADD] px-4 py-2 text-sm font-medium text-[#378ADD] transition hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {validando ? (
              <><Loader2 size={16} className="animate-spin" /> Validando...</>
            ) : (
              <><ShieldCheck size={16} /> {refepsValidado ? "Re-validar REFEPS" : "Validar REFEPS"}</>
            )}
          </button>
          {!m.dni && (
            <p className="mt-1 text-xs text-gray-400">El médico no tiene DNI cargado</p>
          )}
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

      <div className="border-t border-gray-100 pt-4">
        <button
          onClick={onImpersonate}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#378ADD] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#2d75c4] active:scale-[0.97]"
        >
          <LogIn size={16} /> Ingresar como este médico
        </button>
        <p className="mt-2 text-center text-xs text-gray-400">
          Se abre en nueva pestaña. Tu sesión admin se mantiene.
        </p>
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
