import { NextRequest, NextResponse } from "next/server";
import { verificarFirma } from "@/lib/firma/receta";
import { createAdminClient } from "@/lib/supabase/admin";

// ─── Rate limiting por IP ────────────────────────────────────────────────────
// Fix 2.1: Limitar consultas para evitar enumeración de recetas
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minuto
const RATE_LIMIT_MAX = 10; // 10 requests por minuto por IP
const CONSTANT_DELAY_MS = 500; // Timing constante para evitar timing attacks

const ipRequests = new Map<string, { count: number; windowStart: number }>();

// Limpieza periódica del mapa (evitar memory leak en Vercel serverless)
function cleanupExpired() {
  const now = Date.now();
  for (const [ip, data] of ipRequests) {
    if (now - data.windowStart > RATE_LIMIT_WINDOW_MS * 2) {
      ipRequests.delete(ip);
    }
  }
}

function checkRateLimit(ip: string): boolean {
  cleanupExpired();
  const now = Date.now();
  const entry = ipRequests.get(ip);

  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    ipRequests.set(ip, { count: 1, windowStart: now });
    return true;
  }

  entry.count++;
  if (entry.count > RATE_LIMIT_MAX) {
    return false;
  }

  return true;
}

// ─── Helper: delay constante ─────────────────────────────────────────────────
// Fix 2.1: Toda respuesta tarda el mismo tiempo para evitar timing side-channels
// (no revelar si un ID existe vs no existe por diferencia de latencia)
async function withConstantTime<T>(fn: () => Promise<T>): Promise<T> {
  const start = Date.now();
  const result = await fn();
  const elapsed = Date.now() - start;
  const remaining = CONSTANT_DELAY_MS - elapsed;
  if (remaining > 0) {
    await new Promise((resolve) => setTimeout(resolve, remaining));
  }
  return result;
}

// ─── Endpoint ────────────────────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Rate limiting por IP
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!checkRateLimit(ip)) {
    // Timing constante incluso en rate limit
    await new Promise((resolve) => setTimeout(resolve, CONSTANT_DELAY_MS));
    return NextResponse.json(
      { error: "Demasiadas consultas. Intentá en un minuto." },
      { status: 429 }
    );
  }

  // Validar formato de ID (UUID)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) {
    await new Promise((resolve) => setTimeout(resolve, CONSTANT_DELAY_MS));
    return NextResponse.json(
      { verificada: false, motivo: "Receta no encontrada" },
      { status: 404 }
    );
  }

  // Try/catch dentro de withConstantTime para mantener timing constante
  // incluso si verificarFirma() o la query de médico lanzan excepciones
  const resultado = await withConstantTime(async () => {
    try {
      const verificacion = await verificarFirma(id);

      if (!verificacion.datos) {
        return {
          verificada: false,
          motivo: "Receta no encontrada",
        };
      }

      // Obtener datos mínimos del médico (solo nombre + matrícula, NO contenido médico)
      // Regla Carolina: la página pública NO muestra datos del paciente ni prescripción
      const supabase = createAdminClient();
      const { data: medico } = await supabase
        .from("medicos")
        .select("nombre_completo, especialidad, numero_matricula, tipo_matricula")
        .eq("id", verificacion.datos.medico_id)
        .single();

      return {
        verificada: verificacion.valida,
        alterada: verificacion.alterada,
        firmado_at: verificacion.datos.firmado_at,
        algoritmo: verificacion.datos.algoritmo,
        hash: verificacion.datos.hash_original.slice(0, 16),
        medico: medico
          ? {
              nombre: medico.nombre_completo,
              especialidad: medico.especialidad,
              matricula: `${medico.tipo_matricula ?? ""} ${medico.numero_matricula ?? ""}`.trim(),
            }
          : null,
      };
    } catch (err) {
      console.error("[verificar] error:", err instanceof Error ? err.message : "unknown");
      return { verificada: false, motivo: "Error de verificación" };
    }
  });

  const status = resultado.verificada ? 200 : resultado.motivo ? 404 : 200;
  return NextResponse.json(resultado, { status });
}
