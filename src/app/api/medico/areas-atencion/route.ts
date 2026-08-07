import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  type AreaAtencion,
  definicionArea,
  validarAreas,
} from "@/lib/areas-atencion";

// Guarda las áreas de atención adicionales del médico (ej: Adolescencia 10-19).
//
// Endpoint PROPIO y no un campo más de /api/medico/perfil a propósito: esa ruta ya
// funciona en producción y tiene su propia lógica (matrícula, celular, WhatsApp).
// Separarlos hace que un problema en una no arrastre a la otra.
//
// El dato es INFORMATIVO para el paciente: no habilita ni bloquea nada.

// Normaliza el body sin confiar en el cliente: cualquier cosa que no tenga la forma
// esperada se rechaza con un mensaje claro (no se "adivina" un rango).
function leerAreas(raw: unknown): { areas: AreaAtencion[] } | { error: string } {
  if (!Array.isArray(raw)) return { error: "No pudimos leer las áreas de atención." };
  const areas: AreaAtencion[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") return { error: "No pudimos leer las áreas de atención." };
    const o = item as Record<string, unknown>;
    const area = typeof o.area === "string" ? o.area.trim() : "";
    const def = definicionArea(area);
    if (!def) return { error: "Esa área de atención no existe." };
    // Sin coacción: `Number(null)` y `Number("")` dan 0, así que una edad vacía
    // se guardaba en silencio como 0 y el paciente terminaba leyendo "de 0 a 19
    // años". El servidor no adivina un rango — o viene un número, o se rechaza.
    const numeroLimpio = (v: unknown): number =>
      typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
    const desde = numeroLimpio(o.edad_desde);
    const hasta = numeroLimpio(o.edad_hasta);
    if (!Number.isFinite(desde) || !Number.isFinite(hasta)) {
      return { error: `Completá las dos edades de ${def.etiqueta} (por ejemplo, 10 y 19).` };
    }
    areas.push({ area, edad_desde: desde, edad_hasta: hasta });
  }
  const problema = validarAreas(areas);
  if (problema) return { error: problema };
  return { areas };
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const body = await req.json().catch(() => null);
    const parsed = leerAreas((body as Record<string, unknown> | null)?.areas_atencion);
    if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

    // Escritura con service role SIEMPRE filtrada por user_id (patrón del repo para
    // la fila propia): no depende del grant por columna y nunca puede tocar la fila
    // de otro médico.
    const admin = createAdminClient();
    const { data: medico } = await admin
      .from("medicos")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!medico) return NextResponse.json({ error: "Solo un médico puede editar sus áreas" }, { status: 403 });

    const { error } = await admin
      .from("medicos")
      .update({ areas_atencion: parsed.areas })
      .eq("user_id", user.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, areas_atencion: parsed.areas });
  } catch {
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
