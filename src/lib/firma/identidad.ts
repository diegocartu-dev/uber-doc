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
import { cuilDePaciente } from "@/lib/cuil";
import { cuentasDeDemostracion, NOMBRE_UTILERIA } from "@/lib/institucional/demo";

/**
 * Subconjunto EXACTO de `DocumentoPDF` (src/lib/pdf/receta.ts) que sale impreso
 * y que no está en la fila de `documentos`. Si el PDF empieza a imprimir un dato
 * nuevo de `medicos` o `pacientes`, tiene que sumarse acá o queda fuera del hash.
 */
export type IdentidadDocumento = {
  /**
   * Versión del snapshot. Si cambia el juego de campos, sube.
   *
   * v:2 (09/08/2026) sumó `medico_titulo`, porque la receta pasó a imprimir el
   * tratamiento del profesional y todo lo que se imprime tiene que entrar al hash.
   *
   * REGLA DE ORO AL VERSIONAR: el hash se recalcula normalizando el snapshot
   * guardado, así que un documento v:1 tiene que volver a producir EXACTAMENTE el
   * mismo objeto que produjo cuando se firmó. `canonicalJSON` ordena las claves
   * pero incluye las que existen aunque valgan `undefined` (serializa `null`), o
   * sea que agregar la clave a un v:1 le cambiaría el hash y los documentos ya
   * firmados pasarían a figurar como ALTERADOS. Por eso `medico_titulo` es
   * opcional y en v:1 la clave NO se setea nunca.
   */
  v: 1 | 2;
  medico_nombre: string;
  /**
   * Tratamiento elegido por el profesional ("Dr." / "Dra."). Solo en v:2: en los
   * snapshots v:1 esta clave no existe, y el PDF de esos documentos se imprime
   * sin tratamiento — que es la verdad, porque al firmarlos no se registró.
   */
  medico_titulo?: string;
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
        "nombre_completo, titulo, especialidad, numero_matricula, tipo_matricula, domicilio, domicilio_consultorio, firma_manuscrita_url"
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

  // ── LA REUNIÓN DE DEMOSTRACIÓN NO DEJA NOMBRES ADENTRO DEL SELLO ──────────
  // Este snapshot es INMUTABLE por diseño (entra al hash) y lo sirve
  // `/verificar/{id}`, una página pública y sin auth. La limpieza de la reunión
  // no lo puede tocar: `firma_logs` es append-only y retiene por FK al documento,
  // así que el DELETE rebota y la fila sobrevive para siempre — con el nombre
  // real del participante adentro, publicado bajo el mismo UUID que quedó
  // impreso en el papel proyectado y en el QR que la sala fotografió.
  //
  // Se corta en la raíz: si la cuenta es de demostración, lo que se congela es
  // un nombre de utilería. El participante sigue viendo su nombre en la pantalla
  // (las tablas vivas no cambian) y el papel ya lleva su marca de agua
  // "DEMOSTRACIÓN — SIN VALIDEZ LEGAL".
  //
  // El DNI y el CUIL del paciente se van por lo mismo: son el dato más sensible
  // de los que el panel deja cargar, y su único motivo de existir era que el
  // papel no se viera pobre proyectado. Un papel de demostración se puede ver
  // pobre; un DNI real no se puede quedar en una fila que no se puede borrar.
  //
  // ── Y CON ELLOS SE VA TODO EL BLOQUE DEL PACIENTE ────────────────────────
  // La primera versión de esto anonimizó el nombre, el DNI y el CUIL, y dejó
  // congelados la FECHA DE NACIMIENTO y el SEXO reales. Eso no es un residuo
  // menor: fecha de nacimiento + sexo es dato de salud identificante, entra al
  // hash, vive en `documentos.firma_digital.identidad`, sobrevive a "limpiar
  // reunión" (lo retiene `firma_logs` por FK) y se publica bajo el mismo UUID
  // que quedó impreso en el papel y adentro del QR que la sala fotografió.
  // Peor todavía: la limpieza SÍ borra `pacientes.fecha_nacimiento` de la fila
  // viva, así que el dato terminaba existiendo ÚNICAMENTE donde no se puede
  // borrar.
  //
  // El criterio pasa a ser uno solo y sin excepciones: de una cuenta de
  // demostración NO se congela ningún dato personal del paciente. Ver
  // `pacienteCongeladoParaDemo`.
  //
  // ── Y SI NO SE PUEDE SABER, NO SE FIRMA ──────────────────────────────────
  // `null` = la lectura del mundo falló. No hay respuesta segura por defecto:
  // "no es demo" congela el nombre y el DNI reales del participante para
  // siempre, y "es demo" le pone nombre de utilería al papel válido de un
  // profesional real. Se aborta, que es lo único reversible — el caller ya
  // trata `null` como "no se pudo congelar la identidad" y el profesional
  // reintenta.
  const demo = await cuentasDeDemostracion({ medicoId, pacienteId });
  if (!demo) return null;

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
    v: 2,
    medico_nombre: demo.medico ? NOMBRE_UTILERIA.profesional : texto(medico.nombre_completo),
    medico_titulo: demo.medico ? "" : texto(medico.titulo),
    medico_especialidad: texto(medico.especialidad),
    medico_matricula: `${texto(medico.tipo_matricula)} ${texto(medico.numero_matricula)}`.trim(),
    medico_domicilio: texto(medico.domicilio_consultorio) || texto(medico.domicilio),
    medico_firma_manuscrita_path: textoONull(medico.firma_manuscrita_url),
    ...(demo.paciente
      ? pacienteCongeladoParaDemo()
      : pacienteCongeladoReal(paciente, obraSocialNombre)),
  };
}

/** El juego de campos del paciente que entra al sello, sin el resto del snapshot. */
export type IdentidadPaciente = Pick<
  IdentidadDocumento,
  | "paciente_nombre"
  | "paciente_dni"
  | "paciente_cuil"
  | "paciente_sexo_dni"
  | "paciente_fecha_nacimiento"
  | "paciente_tiene_cobertura"
  | "paciente_obra_social"
  | "paciente_nro_afiliado"
  | "paciente_plan_obra_social"
>;

/**
 * Lo que se congela del paciente de una REUNIÓN DE DEMOSTRACIÓN: nada suyo.
 *
 * Es una función y no un objeto suelto para que un test la pueda recorrer campo
 * por campo y exigir que TODOS estén vacíos — la forma de que agregar un campo
 * nuevo al snapshot sin pensarlo se ponga rojo antes del merge, en vez de
 * aparecer meses después adentro de una fila que no se puede borrar.
 */
export function pacienteCongeladoParaDemo(): IdentidadPaciente {
  return {
    paciente_nombre: NOMBRE_UTILERIA.paciente,
    paciente_dni: "",
    paciente_cuil: "",
    paciente_sexo_dni: null,
    paciente_fecha_nacimiento: null,
    paciente_tiene_cobertura: false,
    paciente_obra_social: null,
    paciente_nro_afiliado: null,
    paciente_plan_obra_social: null,
  };
}

/** Lo que se congela del paciente REAL: exactamente lo que el PDF imprime. */
export function pacienteCongeladoReal(
  paciente: {
    nombre_completo?: unknown;
    dni?: string | null;
    cuil?: string | null;
    sexo_dni?: string | null;
    fecha_nacimiento?: unknown;
    tiene_cobertura?: unknown;
    nro_afiliado?: unknown;
    plan_obra_social?: unknown;
  },
  obraSocialNombre: string | null
): IdentidadPaciente {
  return {
    paciente_nombre: texto(paciente.nombre_completo),
    paciente_dni: texto(paciente.dni),
    // El CUIL guardado si lo hay; si no, derivado de DNI + sexo. La columna
    // `cuil` solo se llenaba en dos momentos del alta, así que un paciente que
    // llegó por cualquier otro camino quedaba sin CUIL para siempre aunque
    // tuviéramos los datos para calcularlo. Derivarlo acá hace que el documento
    // salga completo igual. Si no alcanza para derivarlo queda "" y el PDF
    // imprime el bloque del paciente con nombre + DNI, que es válido.
    paciente_cuil: cuilDePaciente(paciente),
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
  // La versión se CONSERVA tal como se guardó; nunca se normaliza a la última.
  // Devolver v:2 sobre un snapshot v:1 le cambiaría el hash y marcaría como
  // alterado un documento intacto.
  const version = i.v === 1 || i.v === 2 ? i.v : null;
  if (version === null) return null;
  if (typeof i.medico_nombre !== "string" || typeof i.paciente_nombre !== "string") return null;

  const identidad: IdentidadDocumento = {
    v: version,
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

  // Solo v:2 lleva la clave. En v:1 NO se setea ni siquiera en `undefined`:
  // `canonicalJSON` la incluiría igual (como null) y rompería el hash.
  if (version === 2) identidad.medico_titulo = texto(i.medico_titulo);

  return identidad;
}

// ─── Rectificación (camino 5 de documento.ts) ────────────────────────────────

/**
 * Las claves del bloque del PACIENTE dentro del snapshot — lo único que una
 * rectificación de identidad puede tocar. Si el snapshot suma un campo del
 * paciente, va acá o la rectificación no lo va a corregir nunca.
 */
const CLAVES_PACIENTE = [
  "paciente_nombre",
  "paciente_dni",
  "paciente_cuil",
  "paciente_sexo_dni",
  "paciente_fecha_nacimiento",
  "paciente_tiene_cobertura",
  "paciente_obra_social",
  "paciente_nro_afiliado",
  "paciente_plan_obra_social",
] as const;

/**
 * Identidad RECTIFICADA: el bloque del paciente se reemplaza por el de su ficha
 * de hoy; el bloque del profesional y la versión del snapshot se conservan tal
 * como se firmaron. Es pura a propósito: se testea sin base, porque es la
 * garantía de que "no cambiamos nada de lo que escribió el médico".
 *
 * `...anterior` primero: en un snapshot v:1 no existe la clave `medico_titulo`
 * y acá NO se agrega — agregarla le cambiaría el hash (ver la regla de oro de
 * versionado arriba).
 */
export function mezclarIdentidadRectificada(
  anterior: IdentidadDocumento,
  ficha: IdentidadDocumento
): IdentidadDocumento {
  return {
    ...anterior,
    paciente_nombre: ficha.paciente_nombre,
    paciente_dni: ficha.paciente_dni,
    paciente_cuil: ficha.paciente_cuil,
    paciente_sexo_dni: ficha.paciente_sexo_dni,
    paciente_fecha_nacimiento: ficha.paciente_fecha_nacimiento,
    paciente_tiene_cobertura: ficha.paciente_tiene_cobertura,
    paciente_obra_social: ficha.paciente_obra_social,
    paciente_nro_afiliado: ficha.paciente_nro_afiliado,
    paciente_plan_obra_social: ficha.paciente_plan_obra_social,
  };
}

/**
 * Qué claves del paciente cambian entre dos snapshots, con antes y después.
 * Vacío = no hay nada que rectificar. Va al log y a la simulación.
 */
export function diferenciasIdentidadPaciente(
  a: IdentidadDocumento,
  b: IdentidadDocumento
): Record<string, { antes: unknown; despues: unknown }> {
  const d: Record<string, { antes: unknown; despues: unknown }> = {};
  for (const k of CLAVES_PACIENTE) {
    if (a[k] !== b[k]) d[k] = { antes: a[k], despues: b[k] };
  }
  return d;
}
