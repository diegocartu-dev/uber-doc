import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verificarAdmin } from "@/lib/admin-auth";

const TIMEOUT_MS = 3000;
const RATE_LIMIT_MS = 10_000;
const rateLimitMap = new Map<string, number>();

type Estado = "ok" | "degradado" | "error" | "no_configurado" | "simulacion";

interface CheckResult {
  nombre: string;
  icono: string;
  estado: Estado;
  detalle: string;
  latencia_ms: number | null;
  checked_at: string;
  error_tecnico?: string;
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("timeout")), ms)
    ),
  ]);
}

async function timed(fn: () => Promise<{ detalle: string; error_tecnico?: string }>): Promise<{
  estado: Estado;
  latencia_ms: number;
  detalle: string;
  error_tecnico?: string;
}> {
  const start = Date.now();
  try {
    const result = await withTimeout(fn(), TIMEOUT_MS);
    const latencia = Date.now() - start;
    return {
      estado: latencia > TIMEOUT_MS ? "degradado" : "ok",
      latencia_ms: latencia,
      detalle: result.detalle,
      error_tecnico: result.error_tecnico,
    };
  } catch (err) {
    const latencia = Date.now() - start;
    const msg = err instanceof Error ? err.message : "Error desconocido";
    if (msg === "timeout") {
      return { estado: "error", latencia_ms: latencia, detalle: "Timeout — sin respuesta en 3s", error_tecnico: "timeout" };
    }
    return { estado: "error", latencia_ms: latencia, detalle: "Servicio caido", error_tecnico: msg };
  }
}

async function checkSupabase(): Promise<CheckResult> {
  const now = new Date().toISOString();
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return { nombre: "Supabase", icono: "Database", estado: "no_configurado", detalle: "URL no configurada", latencia_ms: null, checked_at: now };
  }
  const result = await timed(async () => {
    const admin = createAdminClient();
    const { error } = await admin.from("admin_users").select("id").limit(1);
    if (error) return { detalle: "Conectado con errores", error_tecnico: error.message };
    return { detalle: "Base de datos + Auth + Storage" };
  });
  return { nombre: "Supabase", icono: "Database", checked_at: now, ...result };
}

async function checkVercel(): Promise<CheckResult> {
  const now = new Date().toISOString();
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL;
  if (!baseUrl) {
    return { nombre: "Vercel", icono: "Globe", estado: "ok", detalle: "Hosting activo (sin URL configurada)", latencia_ms: null, checked_at: now };
  }
  const result = await timed(async () => {
    const url = baseUrl.startsWith("http") ? baseUrl : `https://${baseUrl}`;
    const res = await fetch(`${url}/api/health`, { cache: "no-store" });
    if (!res.ok) return { detalle: "Respondiendo con errores", error_tecnico: `HTTP ${res.status}` };
    return { detalle: "Hosting activo" };
  });
  return { nombre: "Vercel", icono: "Globe", checked_at: now, ...result };
}

async function checkLiveKit(): Promise<CheckResult> {
  const now = new Date().toISOString();
  const url = process.env.LIVEKIT_URL || process.env.NEXT_PUBLIC_LIVEKIT_URL;
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!url || !apiKey || !apiSecret) {
    return { nombre: "LiveKit", icono: "Video", estado: "no_configurado", detalle: "Credenciales no configuradas", latencia_ms: null, checked_at: now };
  }
  const result = await timed(async () => {
    const { RoomServiceClient } = await import("livekit-server-sdk");
    const httpUrl = url.replace("wss://", "https://").replace("ws://", "http://");
    const svc = new RoomServiceClient(httpUrl, apiKey, apiSecret);
    await svc.listRooms();
    return { detalle: "Videollamadas activas" };
  });
  return { nombre: "LiveKit", icono: "Video", checked_at: now, ...result };
}

async function checkMercadoPago(): Promise<CheckResult> {
  const now = new Date().toISOString();
  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) {
    return { nombre: "Mercado Pago", icono: "CreditCard", estado: "no_configurado", detalle: "MP_ACCESS_TOKEN no configurada", latencia_ms: null, checked_at: now };
  }
  const result = await timed(async () => {
    const res = await fetch("https://api.mercadopago.com/users/me", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (res.status === 401) return { detalle: "Token invalido", error_tecnico: "HTTP 401 Unauthorized" };
    if (!res.ok) return { detalle: "Respondiendo con errores", error_tecnico: `HTTP ${res.status}` };
    return { detalle: "Procesamiento de pagos activo" };
  });
  return { nombre: "Mercado Pago", icono: "CreditCard", checked_at: now, ...result };
}

async function checkResend(): Promise<CheckResult> {
  const now = new Date().toISOString();
  const key = process.env.RESEND_API_KEY;
  if (!key || key.includes("placeholder")) {
    return { nombre: "Resend", icono: "Mail", estado: "no_configurado", detalle: "API key no configurada", latencia_ms: null, checked_at: now };
  }
  const result = await timed(async () => {
    const res = await fetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${key}` },
      cache: "no-store",
    });
    if (res.status === 401) return { detalle: "API key invalida", error_tecnico: "HTTP 401" };
    if (!res.ok) return { detalle: "Respondiendo con errores", error_tecnico: `HTTP ${res.status}` };
    return { detalle: "Email transaccional activo" };
  });
  return { nombre: "Resend", icono: "Mail", checked_at: now, ...result };
}

async function checkAnthropic(): Promise<CheckResult> {
  const now = new Date().toISOString();
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return { nombre: "Anthropic (Nova)", icono: "Brain", estado: "no_configurado", detalle: "API key no configurada", latencia_ms: null, checked_at: now };
  }
  const result = await timed(async () => {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1,
        messages: [{ role: "user", content: "hi" }],
      }),
      cache: "no-store",
    });
    if (res.status === 401) return { detalle: "API key invalida", error_tecnico: "HTTP 401" };
    if (res.status === 429) return { detalle: "Rate limit activo", error_tecnico: "HTTP 429" };
    if (!res.ok && res.status !== 200) return { detalle: "Respondiendo con errores", error_tecnico: `HTTP ${res.status}` };
    return { detalle: "Asistente IA activo" };
  });
  if (result.error_tecnico === "HTTP 429") {
    result.estado = "degradado";
    result.detalle = "Rate limit — servicio funcional pero limitado";
  }
  return { nombre: "Anthropic (Nova)", icono: "Brain", checked_at: now, ...result };
}

async function checkOpenAI(): Promise<CheckResult> {
  const now = new Date().toISOString();
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return { nombre: "OpenAI", icono: "Sparkles", estado: "no_configurado", detalle: "API key no configurada", latencia_ms: null, checked_at: now };
  }
  const result = await timed(async () => {
    const res = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${key}` },
      cache: "no-store",
    });
    if (res.status === 401) return { detalle: "API key invalida", error_tecnico: "HTTP 401" };
    if (!res.ok) return { detalle: "Respondiendo con errores", error_tecnico: `HTTP ${res.status}` };
    return { detalle: "Modelos IA activos" };
  });
  return { nombre: "OpenAI", icono: "Sparkles", checked_at: now, ...result };
}

function checkSISA(): CheckResult {
  const now = new Date().toISOString();
  const hasKey = !!process.env.SISA_API_KEY;
  return {
    nombre: "SISA / REFEPS",
    icono: "Shield",
    estado: hasKey ? "ok" : "simulacion",
    detalle: hasKey ? "Validacion de matriculas activa" : "Simulacion — sin API real conectada",
    latencia_ms: null,
    checked_at: now,
  };
}

function checkReNaPDiS(): CheckResult {
  const now = new Date().toISOString();
  return {
    nombre: "ReNaPDiS",
    icono: "FileCheck",
    estado: "simulacion",
    detalle: "Recetas digitales — sin API publica disponible",
    latencia_ms: null,
    checked_at: now,
  };
}

export async function GET() {
  const user = await verificarAdmin();
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const now = Date.now();
  const lastCheck = rateLimitMap.get(user.id);
  if (lastCheck && now - lastCheck < RATE_LIMIT_MS) {
    return NextResponse.json(
      { error: "Demasiadas solicitudes. Espera 10 segundos." },
      { status: 429 }
    );
  }
  rateLimitMap.set(user.id, now);

  const results = await Promise.allSettled([
    checkSupabase(),
    checkVercel(),
    checkLiveKit(),
    checkMercadoPago(),
    checkResend(),
    checkAnthropic(),
    checkOpenAI(),
  ]);

  const integraciones: CheckResult[] = results.map((r) =>
    r.status === "fulfilled" ? r.value : {
      nombre: "Desconocido",
      icono: "AlertTriangle",
      estado: "error" as Estado,
      detalle: "Error interno del check",
      latencia_ms: null,
      checked_at: new Date().toISOString(),
      error_tecnico: "check_interno_fallido",
    }
  );

  integraciones.push(checkSISA(), checkReNaPDiS());

  return NextResponse.json({ integraciones });
}
