import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generarRecetaPDF } from "@/lib/pdf/receta";
import type { FirmaDigitalPDF, DocumentoPDF } from "@/lib/pdf/receta";
import { identidadDesdeJSONB } from "@/lib/firma/identidad";

/**
 * Valida defensivamente el JSONB de firma antes de mostrarlo en el PDF.
 * Si el objeto no tiene los tres campos mínimos, se trata como SIN firma:
 * el PDF nunca debe afirmar que hay sello si no lo puede probar.
 * `verificarId` es el id que va al QR de verificación pública.
 */
function firmaDesdeJSONB(valor: unknown, verificarId: string): FirmaDigitalPDF | null {
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

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: documentoId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  // Buscar documento — RLS garantiza que solo el paciente o médico lo ve
  const { data: doc, error: docError } = await supabase
    .from("documentos")
    .select("id, tipo, diagnostico, contenido, tratamiento, dias_reposo, created_at, medico_id, consulta_id, turno_id, paciente_id")
    .eq("id", documentoId)
    .single();

  if (docError || !doc) {
    return NextResponse.json({ error: "Documento no encontrado" }, { status: 404 });
  }

  // Datos del médico
  const { data: medico } = await supabase
    .from("medicos")
    .select("nombre_completo, titulo, especialidad, numero_matricula, tipo_matricula, domicilio, domicilio_consultorio, firma_manuscrita_url")
    .eq("id", doc.medico_id)
    .single();

  // Datos del paciente
  const { data: paciente } = await supabase
    .from("pacientes")
    .select("nombre_completo, dni, cuil, sexo_dni, fecha_nacimiento, tiene_cobertura, obra_social, obra_social_id, obra_social_otra, nro_afiliado, plan_obra_social")
    .eq("id", doc.paciente_id)
    .single();

  if (!medico || !paciente) {
    return NextResponse.json({ error: "Datos incompletos" }, { status: 500 });
  }

  // ─── Firma electrónica ──────────────────────────────────────────────────
  // Camino principal: `documentos.firma_digital`, para CUALQUIER tipo de
  // documento (receta, certificado, indicaciones, orden). Es donde firma el
  // cierre de consulta.
  // Se lee con service role en una query aparte: el gate de acceso ya lo hizo
  // el SELECT con RLS de arriba, y así no tocamos ese SELECT (una columna sin
  // grant rompería la query entera y el PDF dejaría de generarse).
  //
  // Camino histórico: la tabla `recetas`. Se mantiene por compatibilidad, pero
  // hoy está vacía — nada del código inserta ahí.
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const adminDb = createAdminClient();

  const { data: docFirma } = await adminDb
    .from("documentos")
    .select("firma_digital")
    .eq("id", documentoId)
    .maybeSingle();

  let firma: FirmaDigitalPDF | null = firmaDesdeJSONB(docFirma?.firma_digital, doc.id);

  if (!firma && doc.tipo === "receta" && (doc.consulta_id || doc.turno_id)) {
    // Buscar por consulta_id o turno_id
    let query = adminDb
      .from("recetas")
      .select("id, firma_digital, estado")
      .eq("estado", "emitida");

    if (doc.consulta_id) {
      query = query.eq("consulta_id", doc.consulta_id);
    } else if (doc.turno_id) {
      query = query.eq("turno_id", doc.turno_id);
    }

    const { data: recetas } = await query
      .order("created_at", { ascending: false })
      .limit(1);

    const receta = recetas?.[0];
    if (receta) {
      firma = firmaDesdeJSONB(receta.firma_digital, receta.id);
    }
  }

  // Resolve obra social name from FK if available
  let obraSocialNombre: string | null = paciente.obra_social ?? null;
  if (paciente.obra_social_id) {
    const { data: os } = await supabase
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
  // tablas vivas.
  //
  // Por qué (corrección post-revisión 07/08/2026): el nombre del paciente, el
  // CUIL, la obra social, el nº de afiliado y hasta el nombre del médico son
  // editables por sus dueños desde /mis-datos DESPUÉS de emitido, y el PDF se
  // regenera en cada request. Un certificado de reposo emitido para "Juan Pérez"
  // volvía a salir con otro nombre, el mismo QR y la página pública en verde
  // diciendo "su contenido no fue alterado desde entonces".
  //
  // Documentos sin sello (los 114 históricos): siguen leyendo datos vivos —
  // no hay snapshot que respetar y el PDF ya declara que no tiene sello.
  const identidad = firma ? identidadDesdeJSONB((docFirma?.firma_digital as { identidad?: unknown } | null)?.identidad) : null;

  const documento = {
    id: doc.id,
    tipo: doc.tipo as DocumentoPDF["tipo"],
    diagnostico: doc.diagnostico,
    contenido: doc.contenido,
    tratamiento: doc.tratamiento ?? null,
    dias_reposo: doc.dias_reposo ?? null,
    created_at: doc.created_at,
    medico_nombre: identidad ? identidad.medico_nombre : medico.nombre_completo,
    // Igual que el resto: si el documento está sellado, el tratamiento sale del
    // snapshot congelado y no de la tabla viva. Un documento v:1 (firmado antes
    // del 09/08/2026) no lo tiene guardado y se imprime sin él: al firmarlo no
    // se registró, y no se inventa a posteriori sobre algo ya firmado.
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
    paciente_cuil: identidad ? identidad.paciente_cuil : paciente.cuil ?? "",
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

  try {
    const pdfBuffer = await generarRecetaPDF(documento);

    return new NextResponse(pdfBuffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${doc.tipo}-${doc.id.slice(0, 8)}.pdf"`,
        "Cache-Control": "private, no-cache",
      },
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "unknown error";
    const errStack = err instanceof Error ? err.stack : "";
    console.error("[PDF] Error generando PDF:", errMsg);
    console.error("[PDF] Stack:", errStack);
    return NextResponse.json({ error: "Error generando PDF", detail: errMsg }, { status: 500 });
  }
}
