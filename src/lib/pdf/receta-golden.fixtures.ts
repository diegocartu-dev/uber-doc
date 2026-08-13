// src/lib/pdf/receta-golden.fixtures.ts
// Los documentos sintéticos del GOLDEN TEST del PDF (ver receta-golden.test.ts).
//
// Viven en un módulo aparte del test por una razón práctica: el día que haya
// que RE-SELLAR las huellas (un cambio deliberado y aprobado del papel del
// B2C), se corre `npx tsx scripts/pdf-golden-huellas.mts`, que importa esto
// mismo y escupe los hashes nuevos. Si estuvieran adentro del `.test.ts`,
// importarlos dispararía la corrida de tests.
//
// ── POR QUÉ ESTOS CUATRO ─────────────────────────────────────────────────────
// Cubren las ramas del generador que se tocaron en la Etapa 5: receta firmada
// con Rp/ estructurado (header + acentos + pie con ReNaPDiS + barcode),
// receta SIN firma (la leyenda "sin sello" del pie), certificado (bloque de
// reposo + su Sección B propia) y orden (la rama de texto plano). Ninguno usa
// firma manuscrita: esa lee de Storage y el golden no puede depender de red.
//
// Datos 100% sintéticos: el repo es público (regla de CLAUDE.md). Nombres,
// DNI, CUIL y matrículas de acá no existen.

import { createHash } from "crypto";
import { inflateSync } from "zlib";
import type { DocumentoPDF } from "@/lib/pdf/receta";

/** Fecha fija: el papel imprime fecha y hora de emisión, y el golden es byte a byte. */
const EMITIDO = "2026-10-19T19:52:00.000Z";

const PACIENTE = {
  paciente_nombre: "Paciente Sintético de Prueba",
  paciente_dni: "10000001",
  paciente_cuil: "20-10000001-3",
  paciente_sexo_dni: "femenino",
  paciente_fecha_nacimiento: "1980-03-15",
  paciente_tiene_cobertura: false,
  paciente_obra_social: null,
  paciente_nro_afiliado: null,
  paciente_plan_obra_social: null,
} as const;

const PROFESIONAL = {
  medico_nombre: "Profesional Sintético",
  medico_titulo: "Dra.",
  medico_especialidad: "Clínica Médica",
  medico_matricula: "MN 000001",
  medico_domicilio: "Calle Falsa 123, Ciudad Sintética",
} as const;

const RP = [
  "Rp/ IBUPROFENO",
  "    Comprimidos recubiertos 400 mg",
  "    Envase por 20 unidades",
  "    Vía oral",
  "",
  "Rp/ AMOXICILINA",
  "    Comprimidos 500 mg",
  "    Envase por 21 unidades",
  "    Vía oral",
].join("\n");

export const FIXTURES: { nombre: string; doc: DocumentoPDF }[] = [
  {
    nombre: "receta firmada con Rp/ estructurado",
    doc: {
      id: "00000000-0000-4000-8000-000000000001",
      tipo: "receta",
      diagnostico: "Faringitis aguda",
      contenido: RP,
      created_at: EMITIDO,
      ...PROFESIONAL,
      ...PACIENTE,
      tratamiento: null,
      dias_reposo: null,
      firma: {
        hash: "0".repeat(64),
        algoritmo: "RSA-SHA256",
        firmado_at: EMITIDO,
        verificar_id: "00000000-0000-4000-8000-000000000001",
      },
      medico_firma_manuscrita_path: null,
    },
  },
  {
    nombre: "receta SIN firma (leyenda de sello ausente)",
    doc: {
      id: "00000000-0000-4000-8000-000000000002",
      tipo: "receta",
      diagnostico: "Faringitis aguda",
      contenido: RP,
      created_at: EMITIDO,
      ...PROFESIONAL,
      ...PACIENTE,
      paciente_tiene_cobertura: true,
      paciente_obra_social: "Obra Social Sintética",
      paciente_nro_afiliado: "999999",
      paciente_plan_obra_social: "Plan Sintético",
      tratamiento: null,
      dias_reposo: null,
      firma: null,
      medico_firma_manuscrita_path: null,
    },
  },
  {
    nombre: "certificado de reposo firmado",
    doc: {
      id: "00000000-0000-4000-8000-000000000003",
      tipo: "certificado",
      diagnostico: "Cuadro respiratorio agudo",
      contenido: "Reposo domiciliario e hidratación.",
      created_at: EMITIDO,
      ...PROFESIONAL,
      ...PACIENTE,
      tratamiento: "Reposo domiciliario, hidratación abundante y control en 48 horas.",
      dias_reposo: 2,
      firma: {
        hash: "0".repeat(64),
        algoritmo: "RSA-SHA256",
        firmado_at: EMITIDO,
        verificar_id: "00000000-0000-4000-8000-000000000003",
      },
      medico_firma_manuscrita_path: null,
    },
  },
  {
    // ⚠ ESCENARIO TODAVÍA-NO-PRODUCIBLE, y hay que leerlo así.
    //
    // Este es el único fixture con `tratamiento` seteado en un documento de
    // tipo `receta`, o sea el único que ejercita el bloque "Tratamiento
    // indicado" del generador. Producción NO puede producir esta forma:
    // `documentos.tratamiento` lo escribe únicamente el candidato de tipo
    // `certificado` (completar-documentacion/route.ts y WorkspaceConsulta.tsx),
    // así que toda receta real viaja con `tratamiento` en null y el bloque
    // nunca se dibuja.
    //
    // Está acá para que el código del bloque no se pudra mientras se decide la
    // captura separada en el workspace (decisión pendiente de Diego: toca el
    // canal clínico). NO es evidencia de que el delta §3.3 de 03-spec esté
    // cubierto — no lo está: en V1 la posología sigue viajando adentro del
    // cuerpo del Rp/, igual que en el B2C.
    nombre: "receta de TRES medicamentos (presupuesto de alto del pie)",
    doc: {
      id: "00000000-0000-4000-8000-000000000005",
      tipo: "receta",
      diagnostico: "Cuadro respiratorio agudo con componente alérgico",
      contenido: [
        RP,
        "",
        "Rp/ LORATADINA",
        "    Comprimidos 10 mg",
        "    Envase por 30 unidades",
        "    Vía oral",
      ].join("\n"),
      created_at: EMITIDO,
      ...PROFESIONAL,
      ...PACIENTE,
      tratamiento: "Un comprimido cada 8 horas por 5 días. Control si persiste la fiebre.",
      dias_reposo: null,
      firma: {
        hash: "0".repeat(64),
        algoritmo: "RSA-SHA256",
        firmado_at: EMITIDO,
        verificar_id: "00000000-0000-4000-8000-000000000005",
      },
      medico_firma_manuscrita_path: null,
    },
  },
  {
    nombre: "orden médica (rama de texto plano)",
    doc: {
      id: "00000000-0000-4000-8000-000000000004",
      tipo: "orden",
      diagnostico: "Control clínico",
      contenido: "Laboratorio: hemograma completo, hepatograma y glucemia en ayunas.",
      created_at: EMITIDO,
      ...PROFESIONAL,
      ...PACIENTE,
      tratamiento: null,
      dias_reposo: null,
      firma: {
        hash: "0".repeat(64),
        algoritmo: "RSA-SHA256",
        firmado_at: EMITIDO,
        verificar_id: "00000000-0000-4000-8000-000000000004",
      },
      medico_firma_manuscrita_path: null,
    },
  },
];

/** Branding sintético del golden — ni nombre ni colores de un cliente real. */
export const BRANDING_SINTETICO = {
  nombre: "Institución Sintética de Salud",
  subnombre: "Provincia Sintética",
  isologoBuffer: null,
  accent: "#7A3E9D",
  efectorTexto:
    "Emitido a través de Docto (docto.com.ar) — plataforma de telemedicina. " +
    "Matrícula del profesional verificada en REFEPS — Red Federal de Registros de Profesionales de la Salud.",
} as const;

/**
 * La Sección C que todavía no existe: una redacción legal REALISTA, de cuatro
 * oraciones, del largo que puede tener el copy definitivo del abogado.
 *
 * El texto del pie NO sale del código: sale de `institucion_config
 * .pdf_efector_texto`, y el camino previsto para cambiarlo es "se cambia el
 * config y NO el código". Con el presupuesto de pie hardcodeado en 13 pt, ese
 * cambio partía la receta en dos páginas —el barcode de la farmacia en una y
 * el número de receta en la otra— y ningún test avisaba, porque el golden solo
 * probaba con el string sintético corto.
 */
export const EFECTOR_LEGAL_LARGO =
  "Este documento fue emitido a través de la plataforma de telemedicina Docto " +
  "(docto.com.ar), que actúa exclusivamente como efector tecnológico y no " +
  "interviene en el acto médico. La responsabilidad profesional sobre el " +
  "contenido corresponde íntegramente al profesional firmante, cuya matrícula " +
  "fue verificada en REFEPS — Red Federal de Registros de Profesionales de la " +
  "Salud del Ministerio de Salud de la Nación. El tratamiento de los datos " +
  "personales de salud se rige por la Ley 25.326 y por el acuerdo de " +
  "tratamiento de datos suscripto entre la institución y el efector tecnológico.";

/** Cuántas páginas tiene el PDF (el presupuesto de alto del pie se mide acá). */
export function paginasDePDF(buffer: Buffer): number {
  return (buffer.toString("latin1").match(/\/Type \/Page[^s]/g) ?? []).length;
}

/**
 * Descomprime los streams Flate de un objeto y neutraliza su `/Length`.
 *
 * ── POR QUÉ ESTO ES LO QUE HACE PORTABLE A LA HUELLA ─────────────────────────
 * Porque la salida de deflate es función de la VERSIÓN DE ZLIB, y la trae Node.
 * Medido: Node 20.19 embebe zlib 1.3.0.1-motley y Node 25.8 embebe 1.2.12 — el
 * MISMO PDF, generado por el MISMO código, da bytes comprimidos distintos.
 * Hasheando los streams tal como salen, las huellas selladas en una máquina de
 * desarrollo ponían en rojo TODOS los PRs en el CI (que fija Node 20) con un
 * falso "el papel cambió", y el arreglo tentador —re-sellar el hash— destruye
 * la garantía en silencio. Verificado empíricamente: 6 de 12 casos fallaban.
 *
 * Inflando, se hashea el contenido ORIGINAL: el mismo en cualquier zlib. Y no
 * se pierde vigilancia — el contenido de los streams (todo el texto dibujado,
 * las coordenadas, la fuente embebida, los píxeles del QR y del barcode) entra
 * igual al hash, solo que descomprimido.
 *
 * El `/Length` se neutraliza porque es el largo COMPRIMIDO. Un cambio real del
 * papel cambia el contenido inflado, que es lo que se hashea.
 */
function normalizarStreams(cuerpo: string): string {
  const marcaInicio = cuerpo.indexOf("stream\n");
  if (marcaInicio < 0 || !/\/Filter\s*\/FlateDecode/.test(cuerpo)) return cuerpo;
  const inicio = marcaInicio + "stream\n".length;
  const fin = cuerpo.lastIndexOf("\nendstream");
  if (fin <= inicio) return cuerpo;
  const comprimido = Buffer.from(cuerpo.slice(inicio, fin), "latin1");
  let plano: string;
  try {
    plano = inflateSync(comprimido).toString("latin1");
  } catch {
    // No era Flate (o está cortado): se hashea tal cual. Peor portabilidad para
    // ese objeto, pero nunca un falso verde.
    return cuerpo;
  }
  const diccionario = cuerpo.slice(0, marcaInicio).replace(/\/Length \d+/g, "/Length N");
  return `${diccionario}stream\n${plano}\nendstream${cuerpo.slice(fin + "\nendstream".length)}`;
}

/**
 * Huella estable del PDF: SHA-256 del CONTENIDO del archivo, normalizado.
 *
 * ── POR QUÉ NO ES EL SHA DEL ARCHIVO CRUDO ───────────────────────────────────
 * Porque dos corridas del MISMO código no dan el mismo archivo, y eso no es una
 * licencia: está medido. Tres cosas varían sin que cambie una sola línea del
 * papel:
 *   · `/CreationDate` y `/ModDate` — el reloj de la máquina.
 *   · La NUMERACIÓN de los objetos de imagen. Los PNG con transparencia (el QR
 *     de verificación) se escriben como imagen + máscara, y pdfkit los arma con
 *     inflate asíncrono: los dos objetos se numeran en el orden en que terminan
 *     de descomprimirse, que a veces es 11/12 y a veces 12/11. El archivo mide
 *     exactamente lo mismo y se ve exactamente igual.
 *   · Los BYTES COMPRIMIDOS de cada stream, que dependen de la versión de zlib
 *     que trae Node (ver `normalizarStreams`). Este es el que rompía el CI.
 *
 * Entonces se normaliza: se descarta la tabla `xref` (son offsets), se parte el
 * cuerpo en objetos, se INFLAN los streams, se despersonalizan las referencias
 * (`12 0 R` → `R`) y las fechas, y se hashea el CONJUNTO ORDENADO de cuerpos
 * más su cantidad. El TAMAÑO del archivo no entra: también es función de la
 * compresión.
 *
 * Lo que sigue vigilando: cada byte de texto, tipografía, color, coordenada e
 * imagen del documento. Un punto de más en una leyenda, un `#378ADD` que se
 * movió, un bloque que cambió de lugar o una fuente distinta rompen el hash. Lo
 * único que deja pasar es un reordenamiento de objetos que no cambie ningún
 * cuerpo — algo que este generador no puede producir por sí solo salvo en el
 * caso de arriba.
 */
export function huellaPDF(buffer: Buffer): string {
  const texto = buffer.toString("latin1");
  const finCuerpo = texto.lastIndexOf("\nxref\n");
  const cuerpo = finCuerpo > 0 ? texto.slice(0, finCuerpo) : texto;

  const objetos = [...cuerpo.matchAll(/\d+ 0 obj\n([\s\S]*?)\nendobj/g)]
    .map((m) =>
      normalizarStreams(m[1])
        .replace(/\d+ 0 R/g, "R")
        // pdfkit no escribe la fecha adentro del diccionario `/Info`: la pone
        // en un objeto suelto (`/CreationDate 17 0 R` → `17 0 obj (D:2026…)`).
        // O sea que el cuerpo a neutralizar es un objeto entero que consiste en
        // una fecha y nada más.
        .replace(/^\(D:[^)]*\)$/, "(D:GOLDEN)")
    )
    .sort();

  return createHash("sha256")
    .update(Buffer.from(`${objetos.length}|${objetos.join("\n%%\n")}`, "latin1"))
    .digest("hex");
}
