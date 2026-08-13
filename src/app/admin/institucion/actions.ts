"use server";

// Server actions del editor de config de la institución (/admin/institucion).
// SOLO instancia institucional: doble guard (flag + admin Docto) en cada
// action — defensa en profundidad además del layout de /admin.
//
// Acá se CREA la fila singleton al provisionar (el "sin fila → error claro"
// de getConfigInstitucion() se resuelve guardando desde esta pantalla) y se
// edita después sin redeploy. Escritura con service role: la tabla no tiene
// grant de INSERT/UPDATE para authenticated.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/admin-auth";
import { esInstitucional } from "@/lib/instancia";
import { invalidarCacheConfigInstitucion } from "@/lib/institucional/config";

async function guardAdminInstitucionalDocto(): Promise<string | null> {
  if (!esInstitucional()) return null; // en B2C estas actions no existen
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !(await isAdmin(user.id))) return null;
  return user.id;
}

export interface ConfigInstitucionInput {
  nombre: string;
  subnombre: string;
  dominio: string;
  color_primary: string;
  color_primary_dark: string;
  color_primary_soft: string;
  pdf_efector_texto: string;
  ci_ventana_inicio: string; // "HH:MM"
  ci_ventana_fin: string;
  slot_duracion_min: number;
  especialidades: string[];
  // Ciclo de vida del link de acceso del paciente (migración 011). Son los
  // números de la POLÍTICA, editables sin tocar código: la propuesta vigente
  // de la spec §5.4 es el default de la tabla, no una constante del repo.
  ventana_entrada_min: number;
  vigencia_documentos_dias: number;
  reenvio_cooldown_minutos: number;
  reenvio_max_por_dia: number;
  mail_from: string;
  wa_remitente_nombre: string;
  telefono_ayuda: string;
  precio_consulta_centavos: number;
  acuerdo_horas_semana_default: number;
}

const HEX = /^#[0-9a-fA-F]{6}$/;
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

function validar(input: ConfigInstitucionInput): string | null {
  if (!input.nombre.trim()) return "Falta el nombre de la institución.";
  if (!input.dominio.trim()) return "Falta el dominio de la instancia.";
  if (!input.mail_from.trim()) return "Falta el remitente de mail.";
  // NOT NULL en la tabla, y la promesa de §2 es que el texto legal se cambia
  // desde acá sin redeploy (la redacción final la traen el CEO y el abogado).
  if (!input.pdf_efector_texto.trim()) return "Falta el texto de efector de los documentos.";
  for (const [campo, valor] of [
    ["primario", input.color_primary],
    ["oscuro", input.color_primary_dark],
    ["suave", input.color_primary_soft],
  ] as const) {
    if (!HEX.test(valor)) return `El color ${campo} debe ser un hex de 6 dígitos (ej. #4A3F8C).`;
  }
  if (!HORA.test(input.ci_ventana_inicio) || !HORA.test(input.ci_ventana_fin))
    return "La ventana de consulta inmediata debe tener formato HH:MM.";
  if (input.ci_ventana_inicio >= input.ci_ventana_fin)
    return "La ventana de consulta inmediata debe empezar antes de terminar.";
  if (!Number.isInteger(input.slot_duracion_min) || input.slot_duracion_min < 5 || input.slot_duracion_min > 120)
    return "La duración del slot debe ser un entero entre 5 y 120 minutos.";
  if (!Number.isInteger(input.ventana_entrada_min) || input.ventana_entrada_min < 0 || input.ventana_entrada_min > 240)
    return "La ventana de entrada del paciente debe ser un entero entre 0 y 240 minutos.";
  if (
    !Number.isInteger(input.vigencia_documentos_dias) ||
    input.vigencia_documentos_dias < 0 ||
    input.vigencia_documentos_dias > 3650
  )
    return "La vigencia de documentos debe ser un entero entre 0 y 3650 días.";
  if (
    !Number.isInteger(input.reenvio_cooldown_minutos) ||
    input.reenvio_cooldown_minutos < 0 ||
    input.reenvio_cooldown_minutos > 1440
  )
    return "La espera entre reenvíos debe ser un entero entre 0 y 1440 minutos.";
  if (!Number.isInteger(input.reenvio_max_por_dia) || input.reenvio_max_por_dia < 1 || input.reenvio_max_por_dia > 100)
    return "El máximo de reenvíos por día debe ser un entero entre 1 y 100.";
  if (!Number.isInteger(input.precio_consulta_centavos) || input.precio_consulta_centavos < 0)
    return "El precio por consulta (en centavos) debe ser un entero ≥ 0.";
  if (!(input.acuerdo_horas_semana_default > 0))
    return "El acuerdo default (horas/semana) debe ser mayor que 0.";
  return null;
}

export async function guardarConfigInstitucion(
  input: ConfigInstitucionInput
): Promise<{ ok: boolean; error?: string }> {
  const uid = await guardAdminInstitucionalDocto();
  if (!uid) return { ok: false, error: "No autorizado" };

  const error = validar(input);
  if (error) return { ok: false, error };

  const admin = createAdminClient();
  const { error: dbError } = await admin.from("institucion_config").upsert({
    id: 1, // singleton — la primera guardada PROVISIONA la instancia
    nombre: input.nombre.trim(),
    subnombre: input.subnombre.trim() || null,
    dominio: input.dominio.trim(),
    color_primary: input.color_primary,
    color_primary_dark: input.color_primary_dark,
    color_primary_soft: input.color_primary_soft,
    pdf_efector_texto: input.pdf_efector_texto.trim(),
    ci_ventana_inicio: input.ci_ventana_inicio,
    ci_ventana_fin: input.ci_ventana_fin,
    slot_duracion_min: input.slot_duracion_min,
    especialidades: input.especialidades.map((e) => e.trim()).filter(Boolean),
    ventana_entrada_min: input.ventana_entrada_min,
    vigencia_documentos_dias: input.vigencia_documentos_dias,
    reenvio_cooldown_minutos: input.reenvio_cooldown_minutos,
    reenvio_max_por_dia: input.reenvio_max_por_dia,
    mail_from: input.mail_from.trim(),
    wa_remitente_nombre: input.wa_remitente_nombre.trim() || null,
    telefono_ayuda: input.telefono_ayuda.trim() || null,
    precio_consulta_centavos: input.precio_consulta_centavos,
    acuerdo_horas_semana_default: input.acuerdo_horas_semana_default,
    updated_at: new Date().toISOString(),
  });

  if (dbError) {
    console.error("[admin/institucion] Error guardando config:", dbError);
    return { ok: false, error: "No se pudo guardar. Revisá los datos e intentá de nuevo." };
  }

  // El cache de 60 s de getConfigInstitucion() no puede servir config vieja
  // recién guardada (aplica a ESTE proceso; otros lambdas vencen solos).
  invalidarCacheConfigInstitucion();
  revalidatePath("/admin/institucion");
  return { ok: true };
}
