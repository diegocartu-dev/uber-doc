// ─── Didit — Validación de identidad biométrica (KYC + RENAPER) ──────────────
// Integración para validar que la persona que se registra como médico ES,
// efectivamente, el titular del DNI/matrícula que declara. Cierra el riesgo de
// suplantación (DNI/CUIT/matrícula son públicos en cualquier receta).
//
// Doc oficial: https://docs.didit.me  (API v3)
// Skills: https://github.com/didit-protocol/skills

// Estados posibles de una sesión / decisión de Didit
export type DiditStatus =
  | "Not Started"
  | "In Progress"
  | "In Review"
  | "Approved"
  | "Declined"
  | "Abandoned"
  | "Expired"
  | "Resubmitted";

// ─── Crear sesión ───────────────────────────────────────────────────────────

export interface DiditCrearSesionParams {
  // vendor_data: identificador NUESTRO del médico (medico_id). Vincula la
  // sesión de Didit con la fila en `medicos`. Llega de vuelta en el webhook.
  vendorData: string;
  // A dónde vuelve el médico al terminar la verificación (UI).
  callbackUrl?: string;
  // Idioma de la UI de Didit (ISO 639-1). Default "es".
  language?: string;
  // Datos esperados — si el documento escaneado difiere, Didit marca warning
  // (fuzzy match). Los usamos para reforzar el cruce nombre↔documento.
  expectedFirstName?: string;
  expectedLastName?: string;
}

// Respuesta de POST /v3/session/
export interface DiditSesion {
  session_id: string;
  session_number?: number;
  session_token?: string;
  url: string; // URL a la que mandamos al médico para verificarse
  status: DiditStatus;
  workflow_id: string;
}

// ─── Decisión / resultado ────────────────────────────────────────────────────

// Datos extraídos del documento (OCR + RENAPER). El document_number es el DNI.
export interface DiditIdVerification {
  status?: string;
  document_type?: string; // "IDENTITY_CARD", "PASSPORT", etc.
  issuing_country?: string; // ISO alpha-3
  first_name?: string;
  last_name?: string;
  date_of_birth?: string; // YYYY-MM-DD
  document_number?: string; // DNI
  expiry_date?: string;
  gender?: string; // "M" / "F"
  nationality?: string;
  mrz?: string;
}

export interface DiditLivenessCheck {
  status?: string;
  method?: string;
  score?: number;
}

export interface DiditFaceMatch {
  status?: string;
  score?: number;
}

// Resultado completo de GET /v3/session/{id}/decision/
export interface DiditDecision {
  session_id: string;
  status: DiditStatus;
  features?: string[];
  id_verifications?: DiditIdVerification[];
  liveness_checks?: DiditLivenessCheck[];
  face_matches?: DiditFaceMatch[];
  // RENAPER y otras validaciones contra base gubernamental viven acá.
  database_validations?: unknown[];
  aml_screenings?: unknown[];
  warnings?: unknown[];
  vendor_data?: string;
}

// ─── Webhook ──────────────────────────────────────────────────────────────────

export interface DiditWebhookPayload {
  session_id: string;
  status: DiditStatus;
  webhook_type?: string; // "status.updated" | "data.updated"
  vendor_data?: string;
  timestamp?: number;
  decision?: DiditDecision;
}
