"use client";

import { useDashboardMedico } from "./DashboardMedicoProvider";
import NotificacionEspera from "@/components/NotificacionEspera";
import NotificacionPacienteListo from "@/components/NotificacionPacienteListo";

export function BadgeEsperando() {
  const { totalEsperando, enVideollamada, badgeFlash } = useDashboardMedico();

  if (totalEsperando === 0) return null;

  return (
    <span
      data-testid="badge-esperando"
      className={!enVideollamada ? "animate-pulse" : ""}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: 20,
        height: 20,
        padding: "0 6px",
        borderRadius: 10,
        background: "#D85A30",
        color: "#fff",
        fontSize: 11,
        fontWeight: 700,
        lineHeight: 1,
        transition: "transform 0.3s ease",
        transform: badgeFlash ? "scale(1.4)" : "scale(1)",
      }}
    >
      {totalEsperando}
    </span>
  );
}

export function BotonSilenciar() {
  const { silenciado, setSilenciado } = useDashboardMedico();

  return (
    <button
      onClick={() => setSilenciado(!silenciado)}
      title={silenciado ? "Activar sonido" : "Silenciar notificaciones"}
      style={{
        background: "transparent",
        border: 0,
        padding: 4,
        cursor: "pointer",
        color: silenciado ? "#E24B4A" : "#888780",
        display: "flex",
        alignItems: "center",
      }}
    >
      {silenciado ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M11 5 6 9H2v6h4l5 4V5Z" />
          <line x1="23" y1="9" x2="17" y2="15" />
          <line x1="17" y1="9" x2="23" y2="15" />
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M11 5 6 9H2v6h4l5 4V5Z" />
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
        </svg>
      )}
    </button>
  );
}

export function PopupEsperando() {
  const { popupData, dismissPopup } = useDashboardMedico();

  if (!popupData) return null;

  return (
    <NotificacionEspera
      pacienteNombre={popupData.pacienteNombre}
      esperandoDesde={popupData.esperandoDesde}
      consultaId={popupData.consultaId}
      tipo={popupData.tipo}
      onDismiss={dismissPopup}
    />
  );
}

export function PopupPagada() {
  // popupListo ya viene gateado por enVideollamada desde el provider.
  // Cubre "paciente listo" de cualquier canal: CI pagada o turno en sala de espera.
  const { popupListo, dismissPopupListo } = useDashboardMedico();

  if (!popupListo) return null;

  return (
    <NotificacionPacienteListo
      tipo={popupListo.tipo}
      id={popupListo.id}
      pacienteNombre={popupListo.pacienteNombre}
      onDismiss={dismissPopupListo}
    />
  );
}
