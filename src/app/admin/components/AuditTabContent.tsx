"use client";

import { useState, useEffect } from "react";
import { Loader2, Clock, Smartphone, Monitor } from "lucide-react";

interface AuditEntry {
  id: number;
  accion: string;
  recurso_tipo: string;
  recurso_id: string | null;
  motivo: string | null;
  desde_mobile: boolean;
  creado_en: string;
  admin_email: string;
}

interface Props {
  recursoTipo?: string;
  recursoId?: string;
  limit?: number;
}

const ACCION_LABELS: Record<string, string> = {
  aprobar_medico: "Aprobo medico",
  rechazar_medico: "Rechazo medico",
  suspender_medico: "Suspendio medico",
  reactivar_medico: "Reactivo medico",
  cambiar_categoria_medico: "Cambio categoria",
  pausar_paciente: "Pauso paciente",
  bloquear_paciente: "Bloqueo paciente",
  reactivar_paciente: "Reactivo paciente",
  forzar_cierre_consulta: "Forzo cierre consulta",
  cambiar_feature_flag: "Cambio feature flag",
  cambiar_comision_global: "Cambio comision",
  cambiar_regimen_nuevos: "Cambio regimen nuevos",
  crear_admin: "Creo admin",
  desactivar_admin: "Desactivo admin",
  cambiar_nivel_admin: "Cambio nivel admin",
  resolver_alerta: "Resolvio alerta",
  ignorar_alerta: "Ignoro alerta",
};

export default function AuditTabContent({
  recursoTipo,
  recursoId,
  limit = 20,
}: Props) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams({ limit: limit.toString() });
    if (recursoTipo) params.set("recursoTipo", recursoTipo);
    if (recursoId) params.set("recursoId", recursoId);

    fetch(`/api/admin/audit-log?${params}`)
      .then((r) => r.json())
      .then((data) => setEntries(data.entries ?? []))
      .finally(() => setLoading(false));
  }, [recursoTipo, recursoId, limit]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 size={20} className="animate-spin text-gray-400" />
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-gray-400">
        Sin actividad registrada
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {entries.map((entry) => (
        <div
          key={entry.id}
          className="flex items-start gap-3 rounded-lg bg-gray-50 p-3"
        >
          <div className="mt-0.5">
            <Clock size={14} className="text-gray-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-gray-900">
              {ACCION_LABELS[entry.accion] || entry.accion}
            </p>
            <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-400">
              <span>{entry.admin_email}</span>
              <span>·</span>
              <span>
                {new Date(entry.creado_en).toLocaleString("es-AR", {
                  day: "2-digit",
                  month: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              {entry.desde_mobile ? (
                <Smartphone size={12} />
              ) : (
                <Monitor size={12} />
              )}
            </div>
            {entry.motivo && (
              <p className="mt-1 text-xs text-gray-500">
                Motivo: {entry.motivo}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
