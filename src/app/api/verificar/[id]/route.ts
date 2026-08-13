import { NextRequest, NextResponse } from "next/server";
import { verificarFirma } from "@/lib/firma/receta";
import { verificarDocumento, type EstadoVerificacion } from "@/lib/firma/documento";
import { createAdminClient } from "@/lib/supabase/admin";
import { documentoEsDemo } from "@/lib/institucional/demo";
import { formatNombreMedico } from "@/lib/utils/texto";

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
      { estado: "no_encontrado", verificada: false, motivo: "Documento no encontrado" },
      { status: 404 }
    );
  }

  // Try/catch dentro de withConstantTime para mantener timing constante
  // incluso si la verificación o la query de médico lanzan excepciones
  const resultado = await withConstantTime(async (): Promise<RespuestaVerificacion> => {
    try {
      // 1. Camino principal: tabla `documentos` (receta, certificado,
      //    indicaciones, orden). Es donde vive todo lo que se emite hoy.
      const doc = await verificarDocumento(id);

      if (doc.estado !== "no_encontrado") {
        // ¿Salió de una cuenta de demostración? El papel ya lo dice con su
        // marca de agua; la página pública tiene que decir lo mismo, porque es
        // acá donde va a mirar el que recibe el documento y duda. Se resuelve
        // con service role en una query aparte (la columna solo existe en la
        // base de la instancia) y el campo VIAJA SOLO CUANDO ES VERDADERO: en
        // el B2C la respuesta sale idéntica, sin una clave de más.
        const demostracion = await documentoEsDemo(id);
        return {
          estado: doc.estado,
          verificada: doc.estado === "verificada",
          ...(demostracion ? { demostracion: true as const } : {}),
          alterada: doc.estado === "alterada",
          firmado_at: doc.datos?.firmado_at,
          // Fecha de EMISIÓN. Va siempre, no solo en el sellado diferido: la
          // página muestra las dos fechas en todos los casos y en el normal
          // coinciden, que es la mejor prueba de que acá no se toca ninguna.
          emitido_at: doc.emitido_at ?? undefined,
          // El sello se aplicó después de la emisión. La página lo explica en
          // criollo; si por lo que sea ese bloque no se pudiera mostrar, la regla
          // es no sellar (dictamen 07/08/2026, límite 4).
          sellado_diferido: doc.sellado_diferido,
          algoritmo: doc.datos?.algoritmo,
          hash: doc.datos?.hash_original.slice(0, 16),
          // Firmante congelado en la firma cuando existe: si el médico se
          // cambió el nombre después, el papel y esta página tienen que decir
          // lo mismo. Sin sello (históricos) se cae a la fila viva de `medicos`.
          medico: doc.firmante ?? (await datosMinimosMedico(doc.medico_id)),
        };
      }

      // 2. Camino histórico: tabla `recetas`.
      const verificacion = await verificarFirma(id);

      if (!verificacion.datos) {
        return {
          estado: "no_encontrado",
          verificada: false,
          motivo: "Documento no encontrado",
        };
      }

      // Camino histórico `recetas`: no expone fecha de emisión, y nada del
      // código inserta ahí desde hace tiempo. Sin `emitido_at` la página muestra
      // solo la fila del sello, que es lo único que puede afirmar.
      return {
        estado: verificacion.alterada
          ? "alterada"
          : verificacion.valida
            ? "verificada"
            : "invalida",
        verificada: verificacion.valida,
        alterada: verificacion.alterada,
        sellado_diferido: false,
        firmado_at: verificacion.datos.firmado_at,
        algoritmo: verificacion.datos.algoritmo,
        hash: verificacion.datos.hash_original.slice(0, 16),
        medico: await datosMinimosMedico(verificacion.datos.medico_id),
      };
    } catch (err) {
      console.error("[verificar] error:", err instanceof Error ? err.message : "unknown");
      return { estado: "error", verificada: false, motivo: "Error de verificación" };
    }
  });

  const status = resultado.estado === "no_encontrado" ? 404 : 200;
  return NextResponse.json(resultado, { status });
}

type RespuestaVerificacion = {
  estado: EstadoVerificacion | "error";
  verificada: boolean;
  /**
   * Documento emitido por una cuenta de DEMOSTRACIÓN (modo demo institucional).
   * Solo aparece cuando es `true`: en el B2C la respuesta no cambia en nada.
   */
  demostracion?: true;
  alterada?: boolean;
  /** Instante REAL del sello criptográfico. Nunca una fecha anterior a la real. */
  firmado_at?: string;
  /** Fecha de emisión del documento (el acto médico). */
  emitido_at?: string;
  /** El sello se aplicó después de la emisión (documentos históricos). */
  sellado_diferido?: boolean;
  algoritmo?: string;
  hash?: string;
  motivo?: string;
  medico?: { nombre: string; especialidad: string; matricula: string } | null;
};

/**
 * Datos mínimos del firmante: nombre + especialidad + matrícula.
 * Regla Carolina: la página pública NO muestra datos del paciente ni contenido
 * clínico, ni siquiera cuando la verificación es exitosa.
 */
async function datosMinimosMedico(medicoId: string | null) {
  if (!medicoId) return null;
  const supabase = createAdminClient();
  // `titulo` ("Dr."/"Dra.") entra al SELECT porque esta página es la que ve
  // quien recibe la receta —una farmacia, un empleador— y nombraba al firmante
  // sin su tratamiento. Es la ÚNICA columna que se suma: acá el cliente es
  // service role, pero la regla vale igual (no aprovechar el viaje).
  const { data: medico } = await supabase
    .from("medicos")
    .select("nombre_completo, titulo, especialidad, numero_matricula, tipo_matricula")
    .eq("id", medicoId)
    .maybeSingle();

  if (!medico) return null;
  return {
    // Este es el camino de los documentos SIN snapshot congelado (históricos):
    // ahí no hay título guardado, así que se lee el vivo de la ficha.
    nombre: formatNombreMedico(medico.nombre_completo, medico.titulo),
    especialidad: medico.especialidad,
    matricula: `${medico.tipo_matricula ?? ""} ${medico.numero_matricula ?? ""}`.trim(),
  };
}
