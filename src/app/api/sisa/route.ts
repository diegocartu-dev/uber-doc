import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { validarMedicoREFEPS } from "@/lib/refeps/validar";

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 5;
const WINDOW_MS = 60 * 60 * 1000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

interface SISAResult {
  encontrado: boolean;
  nombre?: string;
  especialidad?: string;
  estado?: "activa" | "baja_temporal" | "baja_definitiva";
  jurisdiccion?: string;
  error?: string;
}

function simulacion(dni: string, matricula: string): SISAResult {
  if (matricula === "000000") {
    return { encontrado: false, error: "REGISTRO_NO_ENCONTRADO" };
  }
  if (matricula === "999999") {
    return {
      encontrado: true,
      nombre: "Médico en Baja",
      especialidad: "Clínica médica",
      estado: "baja_temporal",
      jurisdiccion: "Nacional",
    };
  }
  if (/^\d{4,6}$/.test(matricula) && /^\d{7,8}$/.test(dni)) {
    return {
      encontrado: true,
      nombre: "Nombre Simulado",
      especialidad: "Clínica médica",
      estado: "activa",
      jurisdiccion: "Nacional",
    };
  }
  return { encontrado: false, error: "FORMATO_INVALIDO" };
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!checkRateLimit(ip)) {
    return NextResponse.json({ error: "Demasiados intentos. Intentá más tarde." }, { status: 429 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { dni, matricula, tipo } = await req.json();
  if (!dni || !matricula) {
    return NextResponse.json({ error: "DNI y matrícula son obligatorios" }, { status: 400 });
  }

  const mode = process.env.SISA_MODE || "simulacion";

  if (mode === "simulacion") {
    const result = simulacion(dni, matricula);
    return NextResponse.json(result);
  }

  // mode === "produccion" — validación real vía REFEPS (Bus de Interoperabilidad)
  const resultado = await validarMedicoREFEPS(dni);
  return NextResponse.json(resultado);
}
