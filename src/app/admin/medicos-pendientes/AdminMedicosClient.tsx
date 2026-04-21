"use client";

import { useState } from "react";
import { CheckCircle, XCircle, ExternalLink, FileText, Copy, Loader2 } from "lucide-react";

interface MedicoPendiente {
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
}

export default function AdminMedicosClient({
  medicosPendientes: initial,
}: {
  medicosPendientes: MedicoPendiente[];
}) {
  const [medicos, setMedicos] = useState(initial);
  const [procesando, setProcesando] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<{ id: string; texto: string; tipo: "ok" | "error" } | null>(null);
  const [confirmandoRechazo, setConfirmandoRechazo] = useState<string | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);

  async function handleAccion(medicoId: string, accion: "aprobar" | "rechazar") {
    setProcesando(medicoId);
    setMensaje(null);
    setConfirmandoRechazo(null);
    try {
      const res = await fetch("/api/admin/medicos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ medicoId, accion }),
      });
      const data = await res.json();
      if (data.ok) {
        setMedicos((prev) => prev.filter((m) => m.id !== medicoId));
        setMensaje({ id: medicoId, texto: accion === "aprobar" ? "Aprobado" : "Rechazado", tipo: "ok" });
      } else {
        setMensaje({ id: medicoId, texto: data.error || "Error", tipo: "error" });
      }
    } catch {
      setMensaje({ id: medicoId, texto: "Error de conexión", tipo: "error" });
    }
    setProcesando(null);
  }

  async function copiarMatricula(tipo: string, numero: string, id: string) {
    await navigator.clipboard.writeText(`${tipo} ${numero}`);
    setCopiado(id);
    setTimeout(() => setCopiado(null), 2000);
  }

  if (medicos.length === 0) {
    return (
      <div className="rounded-xl bg-white p-8 text-center" style={{ border: "1px solid #e5e7eb" }}>
        <p className="text-gray-500">No hay médicos pendientes de revisión.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {medicos.map((m) => (
        <div
          key={m.id}
          className="rounded-xl bg-white p-5"
          style={{ border: "1px solid #e5e7eb" }}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-semibold text-gray-900">
                {m.nombre_completo}
              </h3>
              <p className="mt-0.5 text-sm text-gray-500">{m.especialidad}</p>
            </div>
            <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">
              Pendiente
            </span>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <div>
              <span className="text-gray-400">Email</span>
              <p className="text-gray-700">{m.email}</p>
            </div>
            <div>
              <span className="text-gray-400">DNI</span>
              <p className="text-gray-700">{m.dni || "—"}</p>
            </div>
            <div>
              <span className="text-gray-400">Matrícula</span>
              <p className="text-gray-700">
                {m.tipo_matricula} {m.numero_matricula}
                {m.provincia_matricula ? ` (${m.provincia_matricula})` : ""}
              </p>
            </div>
            <div>
              <span className="text-gray-400">CUIT</span>
              <p className="text-gray-700">{m.cuit || "—"}</p>
            </div>
            <div>
              <span className="text-gray-400">Domicilio</span>
              <p className="text-gray-700">{m.domicilio || "—"}</p>
            </div>
            <div>
              <span className="text-gray-400">Registro</span>
              <p className="text-gray-700">
                {new Date(m.created_at).toLocaleDateString("es-AR")}
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <a
              href="https://sisa.msal.gov.ar/refeps"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => copiarMatricula(m.tipo_matricula, m.numero_matricula, m.id)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-50"
            >
              {copiado === m.id ? (
                <>
                  <CheckCircle size={14} className="text-[#1D9E75]" />
                  Matrícula copiada
                </>
              ) : (
                <>
                  <ExternalLink size={14} />
                  Verificar en REFEPS
                  <Copy size={12} className="text-gray-400" />
                </>
              )}
            </a>

            {m.foto_credencial_url && (
              <button
                onClick={() => {
                  window.open(`/api/admin/credencial?path=${encodeURIComponent(m.foto_credencial_url!)}`, "_blank");
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-50"
              >
                <FileText size={14} />
                Ver credencial
              </button>
            )}
          </div>

          {/* Confirmación de rechazo inline */}
          {confirmandoRechazo === m.id ? (
            <div className="mt-4 rounded-lg border border-[#E24B4A]/30 bg-red-50 p-4">
              <p className="text-sm font-medium text-gray-900">
                ¿Rechazar el registro de {m.nombre_completo}?
              </p>
              <p className="mt-1 text-xs text-gray-500">
                El médico recibirá una notificación de rechazo.
              </p>
              <div className="mt-3 flex gap-3">
                <button
                  onClick={() => handleAccion(m.id, "rechazar")}
                  disabled={procesando === m.id}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#E24B4A] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#c9403f] active:scale-[0.97] disabled:opacity-50"
                >
                  {procesando === m.id ? <Loader2 size={16} className="animate-spin" /> : <XCircle size={16} />}
                  Sí, rechazar
                </button>
                <button
                  onClick={() => setConfirmandoRechazo(null)}
                  className="flex-1 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-4 flex gap-3 border-t border-gray-100 pt-4">
              <button
                onClick={() => handleAccion(m.id, "aprobar")}
                disabled={procesando === m.id}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#378ADD] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#2d75c4] active:scale-[0.97] disabled:opacity-50"
              >
                {procesando === m.id ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
                Aprobar
              </button>
              <button
                onClick={() => setConfirmandoRechazo(m.id)}
                disabled={procesando === m.id}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-[#E24B4A] px-4 py-2.5 text-sm font-medium text-[#E24B4A] transition hover:bg-red-50 active:scale-[0.97] disabled:opacity-50"
              >
                <XCircle size={16} />
                Rechazar
              </button>
            </div>
          )}

          {mensaje?.id === m.id && (
            <p className={`mt-2 text-center text-sm ${mensaje.tipo === "ok" ? "text-[#1D9E75]" : "text-[#E24B4A]"}`}>
              {mensaje.texto}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
