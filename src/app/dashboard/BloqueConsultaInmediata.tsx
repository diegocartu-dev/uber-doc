"use client";

import { useDashboardMedico } from "./DashboardMedicoProvider";
import DisponibilidadMedico from "./DisponibilidadMedico";
import ConsultasEnCurso from "./ConsultasEnCurso";
import ConsultasPendientes from "./ConsultasPendientes";
import HistorialInline from "./HistorialInline";

type Props = {
  medicoId: string;
  disponibleInicial: boolean;
  disponibleDesde: string | null;
  disponibleHasta: string | null;
  duracionConsulta: number;
  precioConsulta: number;
  consultasPendientesCount: number;
};

const titleClass = "text-[13px] font-semibold tracking-wide text-gray-900 uppercase";
const footerClass = "flex items-center justify-between border-t border-gray-100 pt-3 mt-4";

export default function BloqueConsultaInmediata({
  medicoId,
  disponibleInicial,
  disponibleDesde,
  disponibleHasta,
  duracionConsulta,
  precioConsulta,
  consultasPendientesCount,
}: Props) {
  const { disponible, turnosActivosHoy } = useDashboardMedico();

  const inactiva = !disponible || turnosActivosHoy;

  return (
    <div
      className={`space-y-4 rounded-xl p-5 ${inactiva ? "bg-gray-50" : ""}`}
      style={{
        border: "0.5px solid #e5e7eb",
        borderLeft: `4px solid ${inactiva ? "#888780" : "#1D9E75"}`,
        background: inactiva ? undefined : "rgba(29, 158, 117, 0.06)",
        boxShadow: "0 1px 2px 0 rgba(0,0,0,0.05)",
      }}
    >
      {/* Titulo + estado inline */}
      <div className="flex items-center justify-between">
        <h2 className={titleClass}>Consulta inmediata</h2>
        <span
          className="text-xs font-semibold"
          style={{ color: inactiva ? "#888780" : "#1D9E75" }}
        >
          {inactiva ? "Inactiva" : "Activa"}
        </span>
      </div>

      {/* Toggle de disponibilidad */}
      <div className="rounded-xl bg-white" style={{ border: "0.5px solid #e5e7eb" }}>
        <DisponibilidadMedico
          medicoId={medicoId}
          disponible={disponibleInicial}
          disponibleDesde={disponibleDesde}
          disponibleHasta={disponibleHasta}
          duracionConsulta={duracionConsulta}
          precioConsulta={precioConsulta}
          pacientesEnEspera={consultasPendientesCount}
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
