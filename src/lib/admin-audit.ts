// src/lib/admin-audit.ts
// Log inmutable de acciones administrativas.

import { createAdminClient } from "@/lib/supabase/admin";
import { headers } from "next/headers";

export interface AuditLogParams {
  adminUserId: string;
  accion: string;
  recursoTipo:
    | "medico"
    | "paciente"
    | "consulta"
    | "turno"
    | "pago"
    | "feature_flag"
    | "admin_user"
    | "comision"
    | "alerta"
    | "sistema"
    | "sala_espera";
  recursoId?: string;
  payloadAnterior?: Record<string, unknown>;
  payloadNuevo?: Record<string, unknown>;
  motivo?: string;
  metadata?: Record<string, unknown>;
  desdeMobile?: boolean;
}

/**
 * Registra una accion administrativa en el audit log.
 * Inmutable: nunca se puede editar ni borrar.
 * Insercion solo server-side con SERVICE_ROLE.
 *
 * IMPORTANTE: si esta funcion falla, NO debe romper la accion que la invoca.
 */
export async function logAdminAction(params: AuditLogParams): Promise<void> {
  try {
    const supabase = createAdminClient();

    // Extraer IP y user-agent del request
    const headersList = await headers();
    const ip =
      headersList.get("x-forwarded-for")?.split(",")[0].trim() ||
      headersList.get("x-real-ip") ||
      null;
    const userAgent = headersList.get("user-agent") || null;

    await supabase.from("admin_audit_log").insert({
      admin_user_id: params.adminUserId,
      accion: params.accion,
      recurso_tipo: params.recursoTipo,
      recurso_id: params.recursoId || null,
      ip_address: ip,
      user_agent: userAgent,
      desde_mobile: params.desdeMobile || false,
      payload_anterior: params.payloadAnterior || null,
      payload_nuevo: params.payloadNuevo || null,
      motivo: params.motivo || null,
      metadata: params.metadata || null,
    });
  } catch (error) {
    // CRITICAL: si el audit log falla, no se rompe la accion que lo invoca.
    console.error("[admin-audit] Error registrando audit log:", error, {
      accion: params.accion,
      recursoTipo: params.recursoTipo,
      recursoId: params.recursoId,
    });
  }
}

/**
 * Lista de acciones permitidas (constantes para evitar typos)
 */
export const ADMIN_ACTIONS = {
  // Medicos
  APROBAR_MEDICO: "aprobar_medico",
  RECHAZAR_MEDICO: "rechazar_medico",
  SUSPENDER_MEDICO: "suspender_medico",
  REACTIVAR_MEDICO: "reactivar_medico",
  CAMBIAR_CATEGORIA_MEDICO: "cambiar_categoria_medico",

  // Pacientes
  PAUSAR_PACIENTE: "pausar_paciente",
  BLOQUEAR_PACIENTE: "bloquear_paciente",
  REACTIVAR_PACIENTE: "reactivar_paciente",

  // Consultas
  FORZAR_CIERRE_CONSULTA: "forzar_cierre_consulta",

  // Comisiones
  CAMBIAR_COMISION_GLOBAL: "cambiar_comision_global",
  CAMBIAR_REGIMEN_NUEVOS: "cambiar_regimen_nuevos",

  // Feature flags
  CAMBIAR_FEATURE_FLAG: "cambiar_feature_flag",

  // Admins
  CREAR_ADMIN: "crear_admin",
  DESACTIVAR_ADMIN: "desactivar_admin",
  CAMBIAR_NIVEL_ADMIN: "cambiar_nivel_admin",
  REACTIVAR_ADMIN: "reactivar_admin",

  // Alertas
  RESOLVER_ALERTA: "resolver_alerta",
  IGNORAR_ALERTA: "ignorar_alerta",

  // Sala de espera
  CANCELAR_ENTRADA_SALA: "cancelar_entrada_sala",

  // Exportaciones
  EXPORTAR_CSV: "exportar_csv",
} as const;
