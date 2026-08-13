// src/lib/pdf/documento-desde-db.ts
// Armado del `DocumentoPDF` a partir de una fila de `documentos`.
//
// ── POR QUÉ EXISTE ───────────────────────────────────────────────────────────
// Esta lógica vivía entera adentro de `GET /api/documentos/[id]/pdf` (el PDF
// del paciente y del profesional en el B2C). Cuando la institución necesitó
// descargar la historia clínica de un encuentro (escena 5 de la demo), había
// dos caminos: copiar cien líneas —incluida la parte delicada de la identidad
// congelada en la firma— o extraerlas. Copiadas, la copia se despega: el día
// que el B2C corrija algo del sello, el PDF que se lleva la institución sigue
// diciendo lo viejo.
//
// ── EL GATE DE ACCESO NO ESTÁ ACÁ, Y ES A PROPÓSITO ──────────────────────────
// El `client` que se recibe ES el permiso:
//   · El B2C pasa su cliente con RLS: las policies de `documentos` dejan ver la
//     fila solo al paciente dueño o al profesional que la emitió. Si el usuario
//     no tiene derecho, la query devuelve vacío y esta función devuelve null.
//   · El panel institucional pasa service role, porque su gate es OTRO (rol
//     `admin_institucion`, verificado por el caller) y porque la institución es
//     responsable de los datos de su padrón (R26/R27).
// Quien llame con service role SIN haber hecho su propio gate está abriendo la
// historia clínica de cualquiera: el chequeo es del caller, siempre.

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import type { DocumentoPDF, FirmaDigitalPDF } from "@/lib/pdf/receta";
import { identidadDesdeJSONB } from "@/lib/firma/identidad";
import { cuilDePaciente } from "@/lib/cuil";

/**
 * Valida defensivamente el JSONB de firma antes de mostrarlo en el PDF.
 * Si el objeto no tiene los tres campos mínimos, se trata como SIN firma:
 * el PDF nunca debe afirmar que hay sello si no lo puede probar.
 */
export function firmaDesdeJSONB(valor: unknown, verificarId: string): FirmaDigitalPDF | null {
  if (!valor || typeof valor !== "object") return null;
  const fd = valor as Record<string, unknown>;
  if (
    typeof fd.hash === "string" && fd.hash &&
    typeof fd.algoritmo === "string" && fd.algoritmo &&
    typeof fd.firmado_at === "string" && fd.firmado_at
  ) {
    return {
      hash: fd.hash,
      algoritmo: fd.algoritmo,
      firmado_at: fd.firmado_at,
      verificar_id: verificarId,
    };
  }
  return null;
}

export type ResultadoDocumentoPDF =
  | { ok: true; documento: DocumentoPDF; medicoId: string; pacienteId: string }
  | { ok: false; motivo: "no_encontrado" | "datos_incompletos" };

export async function armarDocumentoParaPDF(
  client: SupabaseClient,
  documentoId: string
): Promise<ResultadoDocumentoPDF> {
  const { data: doc, error: docError } = await client
    .from("documentos")
    .select(
      "id, tipo, diagnostico, contenido, tratamiento, dias_reposo, created_at, medico_id, consulta_id, turno_id, paciente_id"
    )
    .eq("id", documentoId)
    .single();

  if (docError || !doc) return { ok: false, motivo: "no_encontrado" };

  const { data: medico } = await client
    .from("medicos")
    .select(
      "nombre_completo, titulo, especialidad, numero_matricula, tipo_matricula, domicilio, domicilio_consultorio, firma_manuscrita_url"
    )
    .eq("id", doc.medico_id)
    .single();

  const { data: paciente } = await client
    .from("pacientes")
    .select(
      "nombre_completo, dni, cuil, sexo_dni, fecha_nacimiento, tiene_cobertura, obra_social, obra_social_id, obra_social_otra, nro_afiliado, plan_obra_social"
    )
    .eq("id", doc.paciente_id)
    .single();

  if (!medico || !paciente) return { ok: false, motivo: "datos_incompletos" };

  // ─── Firma electrónica ──────────────────────────────────────────────────
  // Camino principal: `documentos.firma_digital`, para CUALQUIER tipo de
  // documento. Se lee con service role en una query aparte: el gate de acceso
  // ya lo hizo el SELECT de arriba, y así no tocamos ese SELECT (una columna
  // sin grant rompería la query entera y el PDF dejaría de generarse).
  //
  // Camino histórico: la tabla `recetas`. Se mantiene por compatibilidad, pero
  // hoy está vacía — nada del código inserta ahí.
  const adminDb = createAdminClient();

  const { data: docFirma } = await adminDb
    .from("documentos")
    .select("firma_digital")
    .eq("id", documentoId)
    .maybeSingle();

  let firma: FirmaDigitalPDF | null = firmaDesdeJSONB(docFirma?.firma_digital, doc.id);

  if (!firma && doc.tipo === "receta" && (doc.consulta_id || doc.turno_id)) {
    let query = adminDb.from("recetas").select("id, firma_digital, estado").eq("estado", "emitida");
    if (doc.consulta_id) query = query.eq("consulta_id", doc.consulta_id);
    else if (doc.turno_id) query = query.eq("turno_id", doc.turno_id);

    const { data: recetas } = await query.order("created_at", { ascending: false }).limit(1);
    const receta = recetas?.[0];
    if (receta) firma = firmaDesdeJSONB(receta.firma_digital, receta.id);
  }

  // Nombre de la obra social desde la FK, si la hay.
  let obraSocialNombre: string | null = paciente.obra_social ?? null;
  if (paciente.obra_social_id) {
    const { data: os } = await client
      .from("obras_sociales")
      .select("nombre")
      .eq("id", paciente.obra_social_id)
      .single();
    if (os?.nombre) obraSocialNombre = os.nombre;
  } else if (paciente.obra_social_otra) {
    obraSocialNombre = paciente.obra_social_otra;
  }

  // ─── Identidad impresa ──────────────────────────────────────────────────
  // Si el documento está SELLADO, todo lo que se imprime de `medicos` y
  // `pacientes` sale del snapshot congelado dentro de la firma, no de las
  // tablas vivas: esos datos son editables por sus dueños DESPUÉS de emitido y
  // el PDF se regenera en cada request (corrección 07/08/2026 — un certificado
  // volvía a salir con otro nombre, el mismo QR y la página pública en verde).
  // Documentos sin sello: siguen leyendo datos vivos, y el PDF ya declara que
  // no tiene sello.
  const identidad = firma
    ? identidadDesdeJSONB((docFirma?.firma_digital as { identidad?: unknown } | null)?.identidad)
    : null;

  const documento: DocumentoPDF = {
    id: doc.id,
    tipo: doc.tipo as DocumentoPDF["tipo"],
    diagnostico: doc.diagnostico,
    contenido: doc.contenido,
    tratamiento: doc.tratamiento ?? null,
    dias_reposo: doc.dias_reposo ?? null,
    created_at: doc.created_at,
    medico_nombre: identidad ? identidad.medico_nombre : medico.nombre_completo,
    // Un documento v:1 (firmado antes del 09/08/2026) no tiene el título
    // guardado y se imprime sin él: al firmarlo no se registró, y no se
    // inventa a posteriori sobre algo ya firmado.
    medico_titulo: identidad ? identidad.medico_titulo ?? null : medico.titulo ?? null,
    medico_especialidad: identidad ? identidad.medico_especialidad : medico.especialidad ?? "",
    medico_matricula: identidad
      ? identidad.medico_matricula
      : `${medico.tipo_matricula ?? ""} ${medico.numero_matricula ?? ""}`.trim(),
    medico_domicilio: identidad
      ? identidad.medico_domicilio
      : medico.domicilio_consultorio || medico.domicilio || "",
    paciente_nombre: identidad ? identidad.paciente_nombre : paciente.nombre_completo,
    paciente_dni: identidad ? identidad.paciente_dni : paciente.dni ?? "",
    paciente_cuil: identidad ? identidad.paciente_cuil : cuilDePaciente(paciente),
    paciente_sexo_dni: identidad ? identidad.paciente_sexo_dni : paciente.sexo_dni ?? null,
    paciente_fecha_nacimiento: identidad
      ? identidad.paciente_fecha_nacimiento
      : paciente.fecha_nacimiento ?? null,
    paciente_tiene_cobertura: identidad
      ? identidad.paciente_tiene_cobertura
      : paciente.tiene_cobertura ?? false,
    paciente_obra_social: identidad ? identidad.paciente_obra_social : obraSocialNombre,
    paciente_nro_afiliado: identidad ? identidad.paciente_nro_afiliado : paciente.nro_afiliado ?? null,
    paciente_plan_obra_social: identidad
      ? identidad.paciente_plan_obra_social
      : paciente.plan_obra_social ?? null,
    firma,
    medico_firma_manuscrita_path: identidad
      ? identidad.medico_firma_manuscrita_path
      : medico.firma_manuscrita_url ?? null,
  };

  return { ok: true, documento, medicoId: doc.medico_id as string, pacienteId: doc.paciente_id as string };
}
