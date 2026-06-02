import { createHmac, timingSafeEqual } from "crypto";
import type {
  DiditCrearSesionParams,
  DiditSesion,
  DiditDecision,
} from "./types";

// ─── Constantes ───────────────────────────────────────────────────────────────

const DIDIT_BASE_URL = "https://verification.didit.me/v3";
const APP_BASE_URL = "https://docto.com.ar";

// ─── Configuración desde env vars ─────────────────────────────────────────────

function getApiKey(): string {
  const key = process.env.DIDIT_API_KEY?.trim();
  if (!key) {
    throw new Error("DIDIT: falta DIDIT_API_KEY en el entorno");
  }
  return key;
}

function getWorkflowId(): string {
  const id = process.env.DIDIT_WORKFLOW_ID?.trim();
  if (!id) {
    throw new Error("DIDIT: falta DIDIT_WORKFLOW_ID en el entorno");
  }
  return id;
}

// ─── Crear sesión de verificación ─────────────────────────────────────────────
// POST /v3/session/ — devuelve la URL a la que mandamos al médico.

export async function crearSesionDidit(
  params: DiditCrearSesionParams
): Promise<DiditSesion> {
  const apiKey = getApiKey();
  const workflowId = getWorkflowId();

  const expectedDetails =
    params.expectedFirstName || params.expectedLastName
      ? {
          expected_details: {
            ...(params.expectedFirstName
              ? { first_name: params.expectedFirstName }
              : {}),
            ...(params.expectedLastName
              ? { last_name: params.expectedLastName }
              : {}),
          },
        }
      : {};

  const body = {
    workflow_id: workflowId,
    vendor_data: params.vendorData,
    callback: params.callbackUrl ?? `${APP_BASE_URL}/dashboard`,
    language: params.language ?? "es",
    ...expectedDetails,
  };

  const resp = await fetch(`${DIDIT_BASE_URL}/session/`, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });

  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    throw new Error(
      `DIDIT crear sesión error (${resp.status}): ${t.slice(0, 200)}`
    );
  }

  return (await resp.json()) as DiditSesion;
}

// ─── Obtener decisión / resultado ─────────────────────────────────────────────
// GET /v3/session/{id}/decision/ — leemos el resultado completo (id_verifications,
// liveness, face_match, RENAPER). Lo llamamos al recibir el webhook para tener
// el detalle completo (el payload del webhook puede venir parcial).

export async function obtenerDecisionDidit(
  sessionId: string
): Promise<DiditDecision> {
  const apiKey = getApiKey();

  const resp = await fetch(
    `${DIDIT_BASE_URL}/session/${encodeURIComponent(sessionId)}/decision/`,
    {
      method: "GET",
      headers: { "x-api-key": apiKey },
      signal: AbortSignal.timeout(15_000),
    }
  );

  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    throw new Error(
      `DIDIT decisión error (${resp.status}): ${t.slice(0, 200)}`
    );
  }

  return (await resp.json()) as DiditDecision;
}

// ─── Verificar firma del webhook (HMAC-SHA256 sobre el raw body) ──────────────
// Didit firma cada webhook con HMAC-SHA256 usando el secret compartido.
// CRÍTICO: se firma/verifica sobre el cuerpo CRUDO (raw bytes), nunca sobre un
// objeto re-serializado — cualquier re-stringify altera el payload e invalida
// la firma. El handler debe leer `await req.text()` ANTES de parsear.

export function verificarFirmaWebhook(
  rawBody: string,
  signature: string | null | undefined,
  secret: string
): boolean {
  if (!signature || !secret) return false;

  const expected = createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("hex");

  const expectedBuf = Buffer.from(expected, "hex");

  let signatureBuf: Buffer;
  try {
    signatureBuf = Buffer.from(signature.trim(), "hex");
  } catch {
    return false;
  }

  if (expectedBuf.length !== signatureBuf.length) return false;

  return timingSafeEqual(expectedBuf, signatureBuf);
}

// ─── Validar frescura del timestamp (anti-replay) ─────────────────────────────
// Didit envía X-Timestamp (unix segundos). Rechazamos webhooks de más de 5 min
// para evitar ataques de replay.

export function timestampEsValido(
  timestampHeader: string | null | undefined,
  toleranciaSegundos = 300
): boolean {
  if (!timestampHeader) return true; // si no viene el header, no bloqueamos por esto
  const ts = parseInt(timestampHeader, 10);
  if (Number.isNaN(ts)) return false;
  const ahora = Math.floor(Date.now() / 1000);
  return Math.abs(ahora - ts) <= toleranciaSegundos;
}
