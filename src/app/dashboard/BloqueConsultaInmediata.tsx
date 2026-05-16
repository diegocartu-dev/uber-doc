"use client";

import { useDashboardMedico } from "./DashboardMedicoProvider";
import DisponibilidadMedico from "./DisponibilidadMedico";
import ConsultasEnCurso from "./ConsultasEnCurso";
import ConsultasPendientes from "./ConsultasPendientes";
import HistorialInline from "./HistorialInline";

type Props = {
  medicoId: string;
  disponibleDesde: string | null;
  disponibleHasta: string | null;
  duracionConsulta: number;
  precioConsulta: number;
  consultasPendientesCount: number;
  ocultoClinica: boolean;
  visibleConsultorioParticular: boolean;
};

const titleClass = "text-[13px] font-semibold tracking-wide text-gray-900 uppercase";
const footerClass = "flex items-center justify-between border-t border-gray-100 pt-3 mt-4";

export default function BloqueConsultaInmediata({
  medicoId,
  disponibleDesde,
  disponibleHasta,
  duracionConsulta,
  precioConsulta,
  consultasPendientesCount,
  ocultoClinica,
  visibleConsultorioParticular,
}: Props) {
  const { disponible, turnosActivosHoy } = useDashboardMedico();

  const inactiva = !disponible || turnosActivosHoy;

  return (
    <div
      className={`space-y-4 rounded-xl p-5 ${inactiva ? "bg-gray-50" : ""}`}
      style={{
        border: "0.5px solid #e5e7eb",
        borderLeft: `4px solid ${inactiva ? "#888780" : "#378ADD"}`,
        background: inactiva ? undefined : "rgba(55, 138, 221, 0.06)",
        boxShadow: "0 1px 2px 0 rgba(0,0,0,0.05)",
      }}
    >
      {/* Titulo + estado inline */}
      <div className="flex items-center justify-between">
        <h2 className={titleClass}>Consulta inmediata</h2>
        <span
          className="text-xs font-semibold"
          style={{ color: inactiva ? "#888780" : "#378ADD" }}
        >
          {inactiva ? "Inactiva" : "Activa"}
        </span>
      </div>

      {/* Toggle de disponibilidad */}
      <div className="rounded-xl bg-white" style={{ border: "0.5px solid #e5e7eb" }}>
        <DisponibilidadMedico
          medicoId={medicoId}
          disponibleDesde={disponibleDesde}
          disponibleHasta={disponibleHasta}
          duracionConsulta={duracionConsulta}
          precioConsulta={precioConsulta}
          pacientesEnEspera={consultasPendientesCount}
          ocultoClinica={ocultoClinica}
          visibleConsultorioParticular={visibleConsultorioParticular}
        />
      </div>

      {/* Zona urgencia / contenido */}
      <ConsultasEnCurso medicoId={medicoId} />
      {inactiva ? (
        <div className="rounded-xl px-5 py-8 text-center" style={{ background: "#f8f9fa", border: "0.5px solid #e5e7eb" }}>
          <p className="text-sm text-gray-400">Consulta inmediata inactiva</p>
        </div>
      ) : (
        <ConsultasPendientes medicoId={medicoId} activa />
      )}

      {/* Pie */}
      <div className={footerClass + " justify-end"}>
        <HistorialInline medicoId={medicoId} tipo="consulta" />
      </div>
    </div>
  );
}
