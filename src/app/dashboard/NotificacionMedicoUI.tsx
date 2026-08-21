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

/**
 * Aviso de auto-apagado (decisión Diego, 20/08/2026): el cron apagó la
 * disponibilidad de CI por tiempo y esta pantalla estaba abierta. Suena y se ve
 * como los demás avisos del dashboard. El toggle para reactivarse está en esta
 * misma pantalla — el popup solo tiene que hacer que el médico lo mire.
 *
 * Límite conocido: esto solo lo ve/escucha quien tiene el dashboard abierto. Al
 * que ya se fue lo cubren el push y el mensaje interno persistente (los manda
 * el cron); este popup existe para el que está en la compu con la pestaña de
 * fondo y no se enteraría de que dejó de estar publicado.
 */
export function PopupApagado() {
  const { avisoApagado, dismissAvisoApagado, enVideollamada } = useDashboardMedico();

  // En videollamada no se interrumpe (mismo criterio que los otros popups; el
  // cron además no apaga a alguien con una consulta activa).
  if (!avisoApagado || enVideollamada) return null;

  return (
    <div
      role="alertdialog"
      aria-label="Consulta Inmediata desactivada"
      style={{
        position: "fixed",
        top: 16,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 9999,
        width: "min(420px, calc(100vw - 32px))",
      }}
    >
      <div
        style={{
          background: "#fff",
          border: "1px solid #D85A30",
          borderRadius: 14,
          boxShadow: "0 12px 32px rgba(15,23,32,0.18)",
          padding: "14px 16px",
          display: "flex",
          gap: 12,
          alignItems: "flex-start",
        }}
      >
        <span style={{ fontSize: 22, lineHeight: 1 }}>⏸️</span>
        <div style={{ flex: 1 }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#111" }}>
            Te desactivamos de Consulta Inmediata
          </p>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#555", lineHeight: 1.45 }}>
            Pasaron 3 horas desde que te activaste. Si seguís atendiendo,
            volvé a prender <strong>&ldquo;Disponible&rdquo;</strong> acá abajo para
            que los pacientes te puedan elegir.
          </p>
        </div>
        <button
          onClick={dismissAvisoApagado}
          aria-label="Cerrar aviso"
          style={{
            background: "transparent",
            border: 0,
            padding: 4,
            cursor: "pointer",
            color: "#888780",
            fontSize: 18,
            lineHeight: 1,
          }}
        >
          ×
        </button>
      </div>
    </div>
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
