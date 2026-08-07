// src/lib/firma/identidad.ts
//
// Snapshot de identidad de un documento firmado.
//
// POR QUÉ EXISTE (corrección post-revisión, 07/08/2026):
// El hash de la firma cubría el contenido clínico y los IDs de médico y paciente,
// pero el PDF NO imprime IDs: imprime nombre del paciente, CUIL, sexo, fecha de
// nacimiento, obra social y número de afiliado; nombre del médico, matrícula y
// domicilio. Todo eso se leía EN VIVO de `pacientes` y `medicos` al generar el
// PDF, y todo eso es editable después de emitido (el paciente lo cambia solo
// desde /mis-datos; el médico cambia su propio nombre desde el mismo lugar).
//
// El PDF se regenera en cada request (Cache-Control: private, no-cache), así que
// un certificado de reposo emitido para "Juan Pérez" podía volver a salir con
// otro nombre, mismo QR, y la página pública seguía diciendo en verde
// "su contenido no fue alterado desde entonces". La firma afirmaba integridad
// sobre datos que no cubría.
//
// Solución: al firmar se congela acá el juego EXACTO de campos que el PDF
// imprime, entra al hash (dentro de `firma_digital.identidad`) y el PDF de un
// documento sellado se renderiza desde el snapshot, no desde las tablas vivas.
// Alterar el snapshot sin la clave privada del médico rompe la verificación:
// el hash está firmado con RSA-SHA256.
//
// LÍMITE CONOCIDO: se congela el PATH de la firma manuscrita, no la imagen. Si
// el médico reemplaza el archivo en Storage, cambia el trazo impreso. Es su
// propia firma sobre su propio documento; se registra el límite y no se resuelve
// acá (requeriría hashear el binario y versionar el bucket).

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Subconjunto EXACTO de `DocumentoPDF` (src/lib/pdf/receta.ts) que sale impreso
 * y que no está en la fila de `documentos`. Si el PDF empieza a imprimir un dato
 * nuevo de `medicos` o `pacientes`, tiene que sumarse acá o queda fuera del hash.
 */
export type IdentidadDocumento = {
  /** Versión del snapshot. Si cambia el juego de campos, sube. */
  v: 1;
  medico_nombre: string;
  medico_especialidad: string;
  medico_matricula: string;
  medico_domicilio: string;
  medico_firma_manuscrita_path: string | null;
  paciente_nombre: string;
  paciente_dni: string;
  paciente_cuil: string;
  paciente_sexo_dni: string | null;
  paciente_fecha_nacimiento: string | null;
  paciente_tiene_cobertura: boolean;
  paciente_obra_social: string | null;
  paciente_nro_afiliado: string | null;
  paciente_plan_obra_social: string | null;
};

function texto(valor: unknown): string {
  return typeof valor === "string" ? valor : "";
}

function textoONull(valor: unknown): string | null {
  return typeof valor === "string" && valor.length > 0 ? valor : null;
}

/**
 * Congela la identidad impresa del documento al instante de firmar.
 * Service role: `medicos` tiene columnas sin GRANT para `authenticated` y un
 * SELECT con el cliente RLS que toque una sola de ellas falla ENTERO (CLAUDE.md).
 *
 * Devuelve `null` si falta el médico o el paciente. El caller NO debe firmar en
 * ese caso: un documento sellado sin identidad congelada volvería a afirmar
 * integridad sobre datos vivos.
 */
export async function construirIdentidadDocumento(
  medicoId: string,
  pacienteId: string
): Promise<IdentidadDocumento | null> {
  const supabase = createAdminClient();

  const [{ data: medico }, { data: paciente }] = await Promise.all([
    supabase
      .from("medicos")
      .select(
        "nombre_completo, especialidad, numero_matricula, tipo_matricula, domicilio, domicilio_consultorio, firma_manuscrita_url"
      )
      .eq("id", medicoId)
      .maybeSingle(),
    supabase
      .from("pacientes")
      .select(
        "nombre_completo, dni, cuil, sexo_dni, fecha_nacimiento, tiene_cobertura, obra_social, obra_social_id, obra_social_otra, nro_afiliado, plan_obra_social"
      )
      .eq("id", pacienteId)
      .maybeSingle(),
  ]);

  if (!medico || !paciente) return null;

  // Misma resolución de obra social que el PDF (FK → nombre; "otra"; texto libre).
  let obraSocialNombre: string | null = textoONull(paciente.obra_social);
  if (paciente.obra_social_id) {
    const { data: os } = await supabase
      .from("obras_sociales")
      .select("nombre")
      .eq("id", paciente.obra_social_id)
      .maybeSingle();
    if (os?.nombre) obraSocialNombre = os.nombre;
  } else if (paciente.obra_social_otra) {
    obraSocialNombre = textoONull(paciente.obra_social_otra);
  }

  return {
    v: 1,
    medico_nombre: texto(medico.nombre_completo),
    medico_especialidad: texto(medico.especialidad),
    medico_matricula: `${texto(medico.tipo_matricula)} ${texto(medico.numero_matricula)}`.trim(),
    medico_domicilio: texto(medico.domicilio_consultorio) || texto(medico.domicilio),
    medico_firma_manuscrita_path: textoONull(medico.firma_manuscrita_url),
    paciente_nombre: texto(paciente.nombre_completo),
    paciente_dni: texto(paciente.dni),
    paciente_cuil: texto(paciente.cuil),
    paciente_sexo_dni: textoONull(paciente.sexo_dni),
    paciente_fecha_nacimiento: textoONull(paciente.fecha_nacimiento),
    paciente_tiene_cobertura: paciente.tiene_cobertura === true,
    paciente_obra_social: obraSocialNombre,
    paciente_nro_afiliado: textoONull(paciente.nro_afiliado),
    paciente_plan_obra_social: textoONull(paciente.plan_obra_social),
  };
}

/**
 * Lee el snapshot guardado dentro de `firma_digital.identidad`, normalizándolo
 * a la MISMA forma que produce `construirIdentidadDocumento` (si no, el hash
 * recalculado no reproduce el original y un documento intacto daría "alterado").
 *
 * Devuelve `null` si no hay snapshot o no tiene la forma esperada: en ese caso
 * el PDF vuelve a los datos vivos (documentos históricos, sin sello) y la
 * verificación va a marcar "alterado" si el sello sí existía — que es lo
 * correcto: alguien tocó el snapshot.
 */
export function identidadDesdeJSONB(valor: unknown): IdentidadDocumento | null {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) return null;
  const i = valor as Record<string, unknown>;
  if (i.v !== 1) return null;
  if (typeof i.medico_nombre !== "string" || typeof i.paciente_nombre !== "string") return null;

  return {
    v: 1,
    medico_nombre: texto(i.medico_nombre),
    medico_especialidad: texto(i.medico_especialidad),
    medico_matricula: texto(i.medico_matricula),
    medico_domicilio: texto(i.medico_domicilio),
    medico_firma_manuscrita_path: textoONull(i.medico_firma_manuscrita_path),
    paciente_nombre: texto(i.paciente_nombre),
    paciente_dni: texto(i.paciente_dni),
    paciente_cuil: texto(i.paciente_cuil),
    paciente_sexo_dni: textoONull(i.paciente_sexo_dni),
    paciente_fecha_nacimiento: textoONull(i.paciente_fecha_nacimiento),
    paciente_tiene_cobertura: i.paciente_tiene_cobertura === true,
    paciente_obra_social: textoONull(i.paciente_obra_social),
    paciente_nro_afiliado: textoONull(i.paciente_nro_afiliado),
    paciente_plan_obra_social: textoONull(i.paciente_plan_obra_social),
  };
}
