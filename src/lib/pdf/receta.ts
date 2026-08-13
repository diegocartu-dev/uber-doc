import PDFDocument from "pdfkit";
import path from "path";
import { createHash } from "crypto";
import { formatNombreMedico } from "@/lib/utils/texto";
import QRCode from "qrcode";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const bwipjs = require("bwip-js");

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type DocumentoPDF = {
  id: string;
  tipo: "receta" | "indicaciones" | "certificado" | "orden";
  diagnostico: string;
  contenido: string;
  created_at: string;
  medico_nombre: string;
  /**
   * Título profesional elegido por el médico en su registro (`medicos.titulo`:
   * "Dr." / "Dra."). Va a los TRES lugares donde el papel nombra al firmante:
   * la caja PROFESIONAL, el pie de firma y la leyenda de firma electrónica.
   *
   * Es opcional a propósito: si el caller no lo pasa, el nombre sale pelado
   * ("Ana García") en vez de con un título adivinado. Un documento que la médica
   * FIRMA y que tiene validez legal no puede llamarla "Dr." — sin dato, mejor sin
   * título.
   */
  medico_titulo?: string | null;
  medico_especialidad: string;
  medico_matricula: string;
  medico_domicilio: string;
  paciente_nombre: string;
  paciente_dni: string;
  paciente_cuil: string;
  paciente_sexo_dni: string | null;
  paciente_fecha_nacimiento: string | null;
  paciente_tiene_cobertura: boolean;
  paciente_obra_social: string | null;
  paciente_nro_afiliado: string | null;
  paciente_plan_obra_social: string | null;
  tratamiento?: string | null;
  dias_reposo?: number | null;
  firma?: FirmaDigitalPDF | null;
  medico_firma_manuscrita_path?: string | null;
};

/**
 * Marca blanca del documento institucional (spec institucional §7 + 03-spec §3).
 *
 * ── LA REGLA DE ESTE PARÁMETRO ───────────────────────────────────────────────
 * SIN branding (`undefined`), el PDF del B2C sale BYTE A BYTE IDÉNTICO al de
 * antes de la Etapa 5. No "parecido": idéntico, y hay un golden test que lo
 * verifica con cuatro documentos sintéticos (`receta-golden.test.ts`). Por eso
 * cada delta de acá abajo está escrito como `if (branding)` y no como un valor
 * por defecto distinto: un default nuevo cambiaría el papel de todos.
 *
 * CON branding cambian la marca de arriba, el color de los acentos, la
 * cobertura del paciente y el pie (que suma la Sección C del efector). Lo que
 * NO cambia NUNCA: las Secciones A y B del pie —leyenda de firma electrónica y
 * marco regulatorio—, el sello, el QR de verificación y los barcodes.
 */
export type BrandingPDF = {
  /** "Ministerio de Salud" — arriba a la izquierda, junto al isologo. */
  nombre: string;
  /** "Provincia de ___" — segunda línea, más chica y gris. */
  subnombre?: string | null;
  /** Isologo ya descargado (120×40). Si no viaja, la marca sale en texto. */
  isologoBuffer?: Buffer | null;
  /** Color de los acentos del papel (`institucion_config.pdf_accent`). */
  accent?: string | null;
  /** Texto de la Sección C — efector tecnológico (`pdf_efector_texto`). */
  efectorTexto: string;
  /**
   * DOCUMENTO DE DEMOSTRACIÓN (modo demo, migración 025).
   *
   * En la reunión de venta, el que firma es un participante que NO es médico
   * matriculado. El documento tiene que verse completo —formato, QR que
   * funciona, firma, pie— porque eso es lo que se está mostrando; y tiene que
   * ser inequívocamente imposible de confundir con uno real, porque un papel
   * firmado en una sala de reuniones no puede terminar en una farmacia.
   *
   * Con esto en `true` el papel suma DOS marcas, y ninguna se puede quitar
   * recortando: la de agua en diagonal, que cruza el contenido, y la leyenda
   * del pie, que viaja con el texto.
   */
  demo?: boolean;
};

export type FirmaDigitalPDF = {
  hash: string;
  algoritmo: string;
  firmado_at: string;
  /** Id que se publica en el QR → /verificar/{id}. Es el id del documento. */
  verificar_id: string;
};

// ─── Constantes ───────────────────────────────────────────────────────────────

const COLORS = {
  primary: "#000000",
  secondary: "#666666",
  accent: "#378ADD",
  border: "#E0E0E0",
  bgBox: "#F5F5F5",
  footerText: "#666666",
  pendiente: "#BA7517",
} as const;

// Dominio público de verificación. El QR del sello apunta acá.
const VERIFICAR_BASE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || "https://docto.com.ar"
).replace(/\/+$/, "");

const MARGIN = { top: 36, right: 50, bottom: 10, left: 50 };
const PAGE_WIDTH = 595.28; // A4
const PAGE_HEIGHT = 841.89; // A4
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN.left - MARGIN.right;

// Hallazgo 9 — Tildes correctas
const tipoLabel: Record<string, string> = {
  receta: "RECETA MÉDICA",
  indicaciones: "INDICACIONES MÉDICAS",
  certificado: "CERTIFICADO MÉDICO",
  orden: "ORDEN MÉDICA",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fontsDir(): string {
  return path.join(process.cwd(), "src", "fonts");
}

function formatFecha(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "America/Argentina/Buenos_Aires",
  });
}

// Hallazgo 8 — Hora de emisión para trazabilidad
function formatHora(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Argentina/Buenos_Aires",
  });
}

function formatFechaNacimiento(fecha: string): string {
  const [anio, mes, dia] = fecha.split("-");
  return `${parseInt(dia)}/${parseInt(mes)}/${anio}`;
}

// Fix I-2: Número de receta determinístico basado en hash del UUID.
// Cada descarga del mismo documento genera el mismo número y barcode.
function generarNumeroReceta(id: string, createdAt: string): string {
  const anio = new Date(createdAt).getFullYear();
  const hash = createHash("sha256").update(id).digest("hex");
  const code = hash.slice(0, 8).toUpperCase();
  return `REC-${anio}-${code}`;
}

/**
 * Color de acento efectivo del documento.
 *
 * El valor viene de la config de la institución, o sea de un campo de texto que
 * alguien tipeó en un /admin. Un `#12345` o un `azul` haría que pdfkit tire al
 * pintar y el documento —que es clínico y ya se le prometió al paciente— no
 * saldría. Ante un color que no es un color, el papel sale con el azul de
 * siempre: se pierde la marca, no el documento.
 */
export function accentDe(branding?: BrandingPDF | null): string {
  const valor = (branding?.accent ?? "").trim();
  return /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(valor) ? valor : COLORS.accent;
}

/** Tipografía y cuerpo de la Sección C — una sola fuente de verdad. */
const SECCION_C = { fuente: "Inter", cuerpo: 6.5, gapAntes: 4, gapDespues: 5, colchon: 4 } as const;

// ─── Marca de DEMOSTRACIÓN ───────────────────────────────────────────────────
// El texto vive acá, una sola vez, para que la marca de agua y la leyenda del
// pie no puedan divergir. `LEYENDA_DEMO` es la que se lee; `AGUA_DEMO` es la que
// se ve de lejos.
const AGUA_DEMO = "DEMOSTRACIÓN — SIN VALIDEZ LEGAL";
const LEYENDA_DEMO =
  "DOCUMENTO DE DEMOSTRACIÓN — SIN VALIDEZ LEGAL. Emitido por una cuenta de prueba: no debe dispensarse ni presentarse ante nadie.";
const DEMO = { fuente: "Inter-SemiBold", cuerpo: 7, gapAntes: 4, colchon: 3 } as const;
/** Rojo del design system para lo que impide la acción (#E24B4A). */
const COLOR_DEMO = "#E24B4A";

/**
 * Alto que hay que reservarle a la leyenda de demostración en el pie. Mismo
 * criterio que `altoSeccionC`: se MIDE con pdfkit, no se estima — el texto es
 * largo a propósito y un presupuesto adivinado partiría el documento en dos,
 * dejando el barcode que escanea la farmacia dibujado fuera de la página.
 *
 * Devuelve 0 sin marca de demo: el papel de siempre no se mueve ni un punto.
 */
function altoLeyendaDemo(pdf: PDFKit.PDFDocument, branding?: BrandingPDF | null): number {
  if (!branding?.demo) return 0;
  pdf.font(DEMO.fuente).fontSize(DEMO.cuerpo);
  return DEMO.gapAntes + pdf.heightOfString(LEYENDA_DEMO, { width: CONTENT_WIDTH, align: "center" }) + DEMO.colchon;
}

/**
 * La marca de agua en diagonal. Se dibuja AL FINAL, encima de todo, porque una
 * marca que quedara debajo del contenido se podría tapar con un bloque de texto
 * largo — y porque así cruza también las cajas con fondo gris.
 *
 * Va con opacidad baja y en un solo color: tiene que leerse a un metro de
 * distancia sin comerse el QR ni el barcode, que son las dos cosas del papel
 * que una máquina tiene que poder leer.
 */
function renderMarcaDemostracion(pdf: PDFKit.PDFDocument) {
  const cx = PAGE_WIDTH / 2;
  const cy = PAGE_HEIGHT / 2;
  pdf.save();
  pdf.rotate(-38, { origin: [cx, cy] });
  pdf.opacity(0.11);
  pdf.font("Inter-Bold").fontSize(31).fillColor(COLOR_DEMO);
  pdf.text(AGUA_DEMO, cx - 340, cy - 22, { width: 680, align: "center", lineBreak: false });
  pdf.opacity(1);
  pdf.restore();
}

/**
 * Cuánto alto hay que reservarle a la Sección C del pie (efector tecnológico).
 *
 * ── POR QUÉ SE MIDE Y NO SE ESTIMA ───────────────────────────────────────────
 * Acá había un `13` fijo, y el texto que se imprime NO SALE DEL CÓDIGO: sale de
 * `institucion_config.pdf_efector_texto`, que es un campo de /admin y que el
 * propio comentario declara PROVISORIO hasta que el abogado entregue la
 * redacción final. Medido con pdfkit, el placeholder sintético ya ocupa ~24,7 pt
 * —casi el doble del presupuesto— y entraba en una página solo porque
 * `MARGIN.bottom` es 10 pt y sobraba colchón.
 *
 * Con una redacción legal de cuatro oraciones el papel se partía en dos: la
 * página 1 se quedaba con el QR y el barcode y a la página 2 se iba el número
 * de receta suelto. O sea que el barcode que escanea una farmacia se dibujaba
 * en coordenadas absolutas con `pdf.y` ya pasado el borde inferior. Y el camino
 * previsto para ese cambio es justamente "se cambia el config y NO el código":
 * nada avisaba.
 *
 * Devuelve 0 sin branding — el B2C no tiene Sección C y su presupuesto de pie
 * no se mueve ni un punto.
 */
function altoSeccionC(pdf: PDFKit.PDFDocument, branding?: BrandingPDF | null): number {
  const texto = branding?.efectorTexto?.trim();
  if (!texto) return 0;
  pdf.font(SECCION_C.fuente).fontSize(SECCION_C.cuerpo);
  const alto = pdf.heightOfString(texto, { width: CONTENT_WIDTH, align: "center" });
  return SECCION_C.gapAntes + SECCION_C.gapDespues + alto + SECCION_C.colchon;
}

async function generarBarcodePNG(texto: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    bwipjs.toBuffer(
      {
        bcid: "code128",
        text: texto,
        scale: 3,
        height: 10,
        includetext: false,
      },
      (err: string | Error, png: Buffer) => {
        if (err) reject(err);
        else resolve(png);
      }
    );
  });
}

// ─── Generador principal ─────────────────────────────────────────────────────

export async function generarRecetaPDF(
  doc: DocumentoPDF,
  branding?: BrandingPDF | null
): Promise<Buffer> {
  const accent = accentDe(branding);
  return new Promise(async (resolve, reject) => {
    try {
      const pdf = new PDFDocument({
        size: "A4",
        margins: MARGIN,
        info: {
          Title: `${tipoLabel[doc.tipo] ?? "Documento"} - ${doc.paciente_nombre}`,
          Author: `${formatNombreMedico(doc.medico_nombre, doc.medico_titulo)}`,
          Creator: "Docto - Telemedicina",
        },
      });

      const chunks: Buffer[] = [];
      pdf.on("data", (chunk: Buffer) => chunks.push(chunk));
      pdf.on("end", () => resolve(Buffer.concat(chunks)));
      pdf.on("error", reject);

      // Registrar fuentes Inter
      const fonts = fontsDir();
      pdf.registerFont("Inter", path.join(fonts, "Inter-Regular.ttf"));
      pdf.registerFont("Inter-Medium", path.join(fonts, "Inter-Medium.ttf"));
      pdf.registerFont("Inter-SemiBold", path.join(fonts, "Inter-SemiBold.ttf"));
      pdf.registerFont("Inter-Bold", path.join(fonts, "Inter-Bold.ttf"));

      const titulo = tipoLabel[doc.tipo] ?? "DOCUMENTO MÉDICO";
      const esReceta = doc.tipo === "receta";

      // ─── HEADER ──────────────────────────────────────────────────────
      renderHeader(pdf, titulo, doc.created_at, accent, branding);

      // ─── PROFESIONAL (Hallazgo 1) ───────────────────────────────────────
      await renderProfesionalBox(pdf, doc, accent);

      // ─── PACIENTE (Hallazgo 1) ───────────────────────────────────────
      renderPacienteBox(pdf, doc, accent, branding);

      // ─── DIAGNÓSTICO (Hallazgo 7, 9) ─────────────────────────────────
      pdf.moveDown(0.3);
      renderSectionLabel(pdf, "DIAGNÓSTICO", accent);
      pdf.font("Inter").fontSize(10).fillColor(COLORS.primary);
      pdf.text(doc.diagnostico, MARGIN.left, undefined, { width: CONTENT_WIDTH });

      // ─── CONTENIDO ────────────────────────────────────────────────────
      // Observación #3 Martín: evitar "RECETA MÉDICA" duplicado (ya está en el header)
      pdf.moveDown(0.3);

      if (doc.tipo === "certificado") {
        // Certificado de reposo laboral (art. 210 LCT) — bloques estructurados.
        // El diagnóstico ya se renderizó arriba. Acá: tratamiento + días de reposo.
        renderSectionLabel(pdf, "TRATAMIENTO INDICADO", accent);
        pdf.font("Inter").fontSize(10).fillColor(COLORS.primary);
        pdf.text(doc.tratamiento?.trim() || doc.contenido?.trim() || "—", MARGIN.left, undefined, {
          width: CONTENT_WIDTH,
          lineGap: 2,
        });

        pdf.moveDown(0.4);
        renderSectionLabel(pdf, "REPOSO LABORAL", accent);
        const dias = doc.dias_reposo ?? 0;
        // El reposo corto (≤ 3 días calendario) se expresa en horas (24/48/72 hs); el
        // largo en días. La unidad se deriva del conteo sin ambigüedad porque las horas
        // solo cubren 1-3 días y los días arrancan en 4 (ver WorkspaceConsulta:
        // HORAS_REPOSO_RAPIDAS / DIAS_REPOSO_RAPIDOS).
        const reposoTexto =
          dias >= 1 && dias <= 3
            ? `${dias * 24} horas de reposo laboral`
            : `${dias} día${dias === 1 ? "" : "s"} de reposo laboral`;
        pdf.font("Inter-SemiBold").fontSize(11).fillColor(COLORS.primary);
        pdf.text(reposoTexto, MARGIN.left, undefined, {
          width: CONTENT_WIDTH,
        });
        // Rango cerrado y explícito (Carolina: evita la impugnación por ambigüedad).
        // Argentina no tiene DST → sumar (dias-1) días en ms es +N días calendario.
        pdf.font("Inter").fontSize(9).fillColor(COLORS.secondary);
        if (dias <= 1) {
          pdf.text(`El día ${formatFecha(doc.created_at)}.`, MARGIN.left, undefined, {
            width: CONTENT_WIDTH,
          });
        } else {
          const desde = new Date(doc.created_at);
          const hasta = new Date(desde.getTime() + (dias - 1) * 24 * 60 * 60 * 1000);
          pdf.text(
            `Desde el ${formatFecha(desde.toISOString())} hasta el ${formatFecha(hasta.toISOString())}, ambos inclusive.`,
            MARGIN.left,
            undefined,
            { width: CONTENT_WIDTH }
          );
        }
      } else {
        renderSectionLabel(pdf, esReceta ? "PRESCRIPCIÓN" : titulo, accent);
        if (esReceta && doc.contenido.includes("Rp/")) {
          // Receta estructurada con formato IFA — tipografía diferenciada
          renderRecetaEstructurada(pdf, doc.contenido, accent);
        } else {
          // Texto plano (indicaciones, orden, recetas legacy)
          pdf.font("Inter").fontSize(10).fillColor(COLORS.primary);
          pdf.text(doc.contenido, MARGIN.left, undefined, {
            width: CONTENT_WIDTH,
            lineGap: 2,
          });
        }

        // ─── TRATAMIENTO INDICADO — el tercer bloque clínico ─────────────
        // Delta 03-spec §3.3 (Diego, 12/08): el documento institucional lleva
        // Diagnóstico → Prescripción → Tratamiento indicado, y el Rp/ queda
        // SOLO con lo que dispensa la farmacia (droga, presentación,
        // cantidad); la posología, las pautas y el control salen acá.
        //
        // Va gateado por `branding` a propósito. En el B2C el mismo campo
        // existe pero hoy solo lo escribe el certificado: renderizarlo también
        // en las recetas del B2C cambiaría el papel de todos —el que ya está
        // impreso en farmacias— sin que nadie lo haya decidido.
        //
        // ⚠ HOY ESTE BLOQUE ES INALCANZABLE EN PRODUCCIÓN, y por lo tanto el
        // delta §3.3 NO está entregado en V1. `documentos.tratamiento` lo
        // escribe únicamente el candidato de tipo `certificado`
        // (src/app/api/consulta/[id]/completar-documentacion/route.ts y
        // src/app/medico/consulta/[id]/workspace/WorkspaceConsulta.tsx): el
        // candidato de tipo `receta` viaja siempre con `tratamiento` en null,
        // así que la condición de abajo no puede ser verdadera.
        //
        // Falta la CAPTURA separada en el workspace (spec §7.4, decisión
        // pendiente de Diego): tocarla es tocar el canal clínico y necesita su
        // OK. Hasta entonces el degradado aceptado es que la posología siga
        // viajando adentro del cuerpo del Rp/, igual que en el B2C.
        //
        // El código queda escrito —y con un fixture del golden que lo
        // ejercita, marcado ahí como escenario todavía-no-producible— para que
        // no se pudra mientras tanto.
        if (branding && esReceta && doc.tratamiento?.trim()) {
          pdf.moveDown(0.4);
          renderSectionLabel(pdf, "TRATAMIENTO INDICADO", accent);
          pdf.font("Inter").fontSize(10).fillColor(COLORS.primary);
          pdf.text(doc.tratamiento.trim(), MARGIN.left, undefined, {
            width: CONTENT_WIDTH,
            lineGap: 2,
          });
        }
      }

      // ─── Calcular posición del footer ─────────────────────────────────
      // No-recetas ahora llevan leyenda de firma + marco regulatorio por tipo.
      // Con branding, el pie suma la Sección C (efector tecnológico), y su
      // alto se MIDE — no se estima. El umbral de salto de página cuelga de
      // `footerTopY`, así que se recalcula solo.
      const footerHeight =
        (esReceta ? 125 : 95) + altoSeccionC(pdf, branding) + altoLeyendaDemo(pdf, branding);
      const footerTopY = PAGE_HEIGHT - MARGIN.bottom - footerHeight;

      // Si el contenido ya pasó de donde debería ir la firma, agregar página
      if (pdf.y > footerTopY - 85) {
        pdf.addPage();
      }

      // ─── FIRMA (Hallazgo 5 + 10 — nombre + barcode matrícula) ─────
      await renderFirma(pdf, doc, footerTopY);

      // ─── SELLO FIRMA ELECTRÓNICA — solo si la receta está firmada ───
      if (doc.firma) {
        await renderSelloFirma(pdf, doc.firma, footerTopY, branding);
      }

      // ─── FOOTER (Hallazgo 4 + 11 — leyendas ReNaPDiS) ───────────────
      renderFooter(pdf, doc, esReceta, footerTopY, branding);

      // ─── BARCODE RECETA — a pie de página, centrado, abajo de todo ──
      if (esReceta) {
        const nroReceta = generarNumeroReceta(doc.id, doc.created_at);
        await renderBarcodeReceta(pdf, nroReceta);
      }

      // ─── MARCA DE AGUA DE DEMOSTRACIÓN — lo último, encima de todo ──
      if (branding?.demo) renderMarcaDemostracion(pdf);

      pdf.end();
    } catch (err) {
      reject(err);
    }
  });
}

// ─── Render functions ─────────────────────────────────────────────────────────

// Renderizado estructurado de receta con formato IFA (AAIP/ReNaPDiS compatible)
// Parsea bloques "Rp/ IFA_NAME" seguidos de líneas indentadas con detalles
function renderRecetaEstructurada(pdf: PDFKit.PDFDocument, contenido: string, accent: string) {
  const bloques = contenido.split(/\n\n+/);
  let medIndex = 0;

  for (const bloque of bloques) {
    const lineas = bloque.split("\n");
    const primeraLinea = lineas[0]?.trim() ?? "";

    if (primeraLinea.startsWith("Rp/")) {
      medIndex++;
      const ifa = primeraLinea.replace(/^Rp\/\s*/, "").trim();

      // Número + "Rp/" en el color de acento del papel
      pdf.font("Inter-SemiBold").fontSize(10).fillColor(accent);
      pdf.text(`${medIndex}. Rp/`, MARGIN.left, undefined, {
        width: CONTENT_WIDTH,
        continued: true,
      });

      // IFA name en negro bold
      pdf.font("Inter-Bold").fontSize(10).fillColor(COLORS.primary);
      pdf.text(` ${ifa}`, { width: CONTENT_WIDTH });

      // Líneas de detalle (nombre comercial, forma, presentación, vía)
      for (let i = 1; i < lineas.length; i++) {
        const detalle = lineas[i]?.trim();
        if (!detalle) continue;
        pdf.font("Inter").fontSize(9).fillColor(COLORS.secondary);
        pdf.text(`    ${detalle}`, MARGIN.left, undefined, {
          width: CONTENT_WIDTH,
        });
      }

      pdf.moveDown(0.4);
    } else if (primeraLinea) {
      // Texto libre (no Rp/) — renderizar como texto normal
      pdf.font("Inter").fontSize(10).fillColor(COLORS.primary);
      pdf.text(bloque, MARGIN.left, undefined, {
        width: CONTENT_WIDTH,
        lineGap: 2,
      });
      pdf.moveDown(0.3);
    }
  }
}

function renderHeader(
  pdf: PDFKit.PDFDocument,
  titulo: string,
  createdAt: string,
  accent: string,
  branding?: BrandingPDF | null
) {
  const fecha = formatFecha(createdAt);
  const hora = formatHora(createdAt);

  if (branding) {
    // ── Marca de la INSTITUCIÓN arriba (03-spec §3.1) ──────────────────────
    // La línea "Docto — Telemedicina" NO se imprime acá: la marca de la
    // plataforma se muda al pie (Sección C). En papel oficial de un ministerio,
    // arriba va el ministerio.
    const topY = MARGIN.top;
    let textoX = MARGIN.left;
    if (branding.isologoBuffer) {
      try {
        pdf.image(branding.isologoBuffer, MARGIN.left, topY, { fit: [120, 40] });
        textoX = MARGIN.left + 132;
      } catch (err) {
        // Isologo ilegible (formato raro, archivo cortado, un SVG): la marca
        // sale en texto. Un documento clínico no se cae por una imagen.
        //
        // PERO SE GRITA. Este catch estuvo vacío y el modo de falla era el
        // peor posible: se sube el archivo, el PDF sale sin marca gráfica, y
        // no queda rastro en ningún log — encima con el buffer cacheado 10
        // minutos por lambda, así que el síntoma es intermitente. Que el
        // documento no se caiga es una decisión; que nadie se entere, no.
        console.error(
          "[pdf/receta] El isologo institucional no se pudo dibujar: el documento sale con la marca en texto.",
          err
        );
      }
    }

    pdf.font("Inter-SemiBold").fontSize(11).fillColor(COLORS.primary);
    pdf.text(branding.nombre, textoX, topY + 6, {
      width: PAGE_WIDTH - MARGIN.right - textoX,
    });
    if (branding.subnombre) {
      pdf.font("Inter").fontSize(9).fillColor(COLORS.secondary);
      pdf.text(branding.subnombre, textoX, undefined, {
        width: PAGE_WIDTH - MARGIN.right - textoX,
      });
    }

    // El bloque de marca reserva el alto del isologo aunque el texto sea corto.
    pdf.y = Math.max(pdf.y, topY + 40) + 10;

    pdf.font("Inter-SemiBold").fontSize(15).fillColor(accent);
    pdf.text(titulo, MARGIN.left, pdf.y, { width: CONTENT_WIDTH, align: "center" });

    pdf.moveDown(0.1);
    pdf.font("Inter").fontSize(9).fillColor(COLORS.secondary);
    pdf.text(`${fecha} — ${hora} hs`, MARGIN.left, undefined, {
      width: CONTENT_WIDTH,
      align: "center",
    });
  } else {
    pdf.font("Inter-SemiBold").fontSize(15).fillColor(accent);
    pdf.text(titulo, MARGIN.left, MARGIN.top, {
      width: CONTENT_WIDTH,
      align: "center",
    });

    pdf.moveDown(0.2);
    pdf.font("Inter").fontSize(9).fillColor(COLORS.secondary);
    pdf.text("Docto — Telemedicina", MARGIN.left, undefined, {
      width: CONTENT_WIDTH,
      align: "center",
    });

    // Hallazgo 8 — Fecha con hora de emisión
    pdf.moveDown(0.1);
    pdf.text(`${fecha} — ${hora} hs`, MARGIN.left, undefined, {
      width: CONTENT_WIDTH,
      align: "center",
    });
  }

  // Línea separadora del color de acento
  const lineY = pdf.y + 8;
  pdf
    .moveTo(MARGIN.left, lineY)
    .lineTo(PAGE_WIDTH - MARGIN.right, lineY)
    .strokeColor(accent)
    .lineWidth(1.5)
    .stroke();

  pdf.y = lineY + 12;
}

// Bloque PROFESIONAL — barcode matrícula + nombre + especialidad + domicilio
async function renderProfesionalBox(pdf: PDFKit.PDFDocument, doc: DocumentoPDF, accent: string) {
  const boxX = MARGIN.left;
  const boxWidth = CONTENT_WIDTH;
  const padding = 10;
  const titleHeight = 14;
  const lineHeight = 13;
  const fontSize = 9;
  const barcodeHeight = 22; // barcode + texto matrícula debajo
  const barcodeSpacing = 4;

  const rows: string[] = [];
  rows.push(formatNombreMedico(doc.medico_nombre, doc.medico_titulo));
  rows.push(`${doc.medico_especialidad} — ${doc.medico_matricula}`);
  if (doc.medico_domicilio) {
    rows.push(doc.medico_domicilio);
  }

  const boxHeight = padding * 2 + titleHeight + barcodeHeight + barcodeSpacing + rows.length * lineHeight;
  const boxY = pdf.y;

  // Fondo + borde
  pdf.roundedRect(boxX, boxY, boxWidth, boxHeight, 3).fillColor(COLORS.bgBox).fill();
  pdf.roundedRect(boxX, boxY, boxWidth, boxHeight, 3).strokeColor(COLORS.border).lineWidth(0.5).stroke();

  // Título
  let currentY = boxY + padding;
  pdf.font("Inter-SemiBold").fontSize(8).fillColor(accent);
  pdf.text("PROFESIONAL", boxX + padding, currentY, {
    width: boxWidth - padding * 2,
    characterSpacing: 1,
  });
  currentY += titleHeight;

  // Barcode matrícula dentro de la caja
  try {
    const matriculaBarcode = await generarBarcodePNG(doc.medico_matricula);
    const barcodeWidth = 130;
    pdf.image(matriculaBarcode, boxX + padding, currentY, { width: barcodeWidth, height: 16 });
    currentY += barcodeHeight + barcodeSpacing;
  } catch {
    // Fallback sin barcode
    currentY += barcodeSpacing;
  }

  // Filas de texto
  for (let i = 0; i < rows.length; i++) {
    pdf
      .font(i === 0 ? "Inter-SemiBold" : "Inter")
      .fontSize(fontSize)
      .fillColor(COLORS.primary);
    pdf.text(rows[i], boxX + padding, currentY, {
      width: boxWidth - padding * 2,
    });
    currentY += lineHeight;
  }

  pdf.y = boxY + boxHeight + 10;
}

// Hallazgo 1 — Bloque PACIENTE en caja gris equivalente
function renderPacienteBox(
  pdf: PDFKit.PDFDocument,
  doc: DocumentoPDF,
  accent: string,
  branding?: BrandingPDF | null
) {
  const rows: Array<{ left: string; right?: string }> = [];

  rows.push({ left: doc.paciente_nombre });

  const dni = doc.paciente_dni.trim();
  const cuil = doc.paciente_cuil.trim();
  if (dni || cuil) {
    const l = dni ? `DNI: ${dni}` : "";
    const r = cuil ? `CUIL: ${cuil}` : "";
    if (l && r) rows.push({ left: l, right: r });
    else rows.push({ left: l || r });
  }

  const sexo = doc.paciente_sexo_dni
    ? `Sexo: ${doc.paciente_sexo_dni === "femenino" ? "F" : "M"}`
    : "";
  const fechaNac = doc.paciente_fecha_nacimiento
    ? `Fecha nac.: ${formatFechaNacimiento(doc.paciente_fecha_nacimiento)}`
    : "";
  if (sexo || fechaNac) {
    if (sexo && fechaNac) rows.push({ left: sexo, right: fechaNac });
    else rows.push({ left: sexo || fechaNac });
  }

  if (doc.paciente_tiene_cobertura && doc.paciente_obra_social) {
    rows.push({ left: `Obra Social: ${doc.paciente_obra_social}` });
    rows.push({ left: `Plan: ${doc.paciente_plan_obra_social ?? ""}` });
    rows.push({ left: `Nº Afiliado: ${doc.paciente_nro_afiliado ?? ""}` });
  } else {
    // Único delta de CONTENIDO de esta caja (03-spec §3.4): el paciente
    // institucional no es "Particular" — lo cubre la institución que lo mandó.
    rows.push({ left: `Cobertura: ${branding ? branding.nombre : "Particular"}` });
  }

  renderInfoBoxTwoCol(pdf, "PACIENTE", rows, accent);
}

// ─── Box rendering helpers ────────────────────────────────────────────────────

function renderInfoBoxTwoCol(
  pdf: PDFKit.PDFDocument,
  title: string,
  rows: Array<{ left: string; right?: string }>,
  accent: string
) {
  const boxX = MARGIN.left;
  const boxWidth = CONTENT_WIDTH;
  const padding = 10;
  const titleHeight = 14;
  const lineHeight = 13;
  const fontSize = 9;

  const boxHeight = padding * 2 + titleHeight + rows.length * lineHeight;
  const boxY = pdf.y;

  // Fondo + borde
  pdf.roundedRect(boxX, boxY, boxWidth, boxHeight, 3).fillColor(COLORS.bgBox).fill();
  pdf.roundedRect(boxX, boxY, boxWidth, boxHeight, 3).strokeColor(COLORS.border).lineWidth(0.5).stroke();

  // Título de bloque
  let currentY = boxY + padding;
  pdf.font("Inter-SemiBold").fontSize(8).fillColor(accent);
  pdf.text(title, boxX + padding, currentY, {
    width: boxWidth - padding * 2,
    characterSpacing: 1,
  });
  currentY += titleHeight;

  // Filas
  const halfWidth = (boxWidth - padding * 2) / 2;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const isBold = i === 0;

    pdf
      .font(isBold ? "Inter-SemiBold" : "Inter")
      .fontSize(fontSize)
      .fillColor(COLORS.primary);
    pdf.text(row.left, boxX + padding, currentY, {
      width: row.right ? halfWidth : boxWidth - padding * 2,
    });

    if (row.right) {
      pdf.text(row.right, boxX + padding + halfWidth, currentY, { width: halfWidth });
    }

    currentY += lineHeight;
  }

  pdf.y = boxY + boxHeight + 4;
}

// Hallazgo 7, 9 — Label de sección con tilde y estilo consistente
function renderSectionLabel(pdf: PDFKit.PDFDocument, label: string, accent: string) {
  pdf.font("Inter-SemiBold").fontSize(9).fillColor(accent);
  pdf.text(label, MARGIN.left, undefined, {
    width: CONTENT_WIDTH,
    characterSpacing: 1,
  });
  pdf.moveDown(0.15);
}

// Hallazgo 5 + 10 — Firma: imagen manuscrita + línea + nombre + barcode matrícula
// Posicionada justo arriba del footer, alineada a la derecha
async function renderFirma(pdf: PDFKit.PDFDocument, doc: DocumentoPDF, footerTopY: number) {
  // El bloque firma ocupa ~65pt (línea + nombre + barcode + matrícula)
  // + imagen de firma manuscrita arriba si existe
  const firmaBlockHeight = 65;
  const firmaImageHeight = 45; // altura de la imagen de firma manuscrita
  const hasImage = !!doc.medico_firma_manuscrita_path;
  const totalHeight = firmaBlockHeight + (hasImage ? firmaImageHeight + 5 : 0);
  const firmaY = footerTopY - totalHeight - 10;
  const firmaWidth = 200;
  const lineX = PAGE_WIDTH - MARGIN.right - firmaWidth;
  const lineEndX = PAGE_WIDTH - MARGIN.right;

  // Imagen de firma manuscrita (si existe) — apoyada sobre la línea
  let lineY = firmaY;
  if (hasImage) {
    try {
      const { createAdminClient } = await import("@/lib/supabase/admin");
      const admin = createAdminClient();
      const { data } = await admin.storage
        .from("firmas-medicos")
        .download(doc.medico_firma_manuscrita_path!);

      if (data) {
        const imgBuffer = Buffer.from(await data.arrayBuffer());
        const imgWidth = 150;
        const imgX = lineX + (firmaWidth - imgWidth) / 2;
        pdf.image(imgBuffer, imgX, firmaY, {
          width: imgWidth,
          height: firmaImageHeight,
          fit: [imgWidth, firmaImageHeight],
          align: "center",
          valign: "bottom",
        });
      }
    } catch {
      // Fallback silencioso — mostrar firma sin imagen
    }
    lineY = firmaY + firmaImageHeight + 5;
  }

  // Línea de firma
  pdf
    .moveTo(lineX, lineY)
    .lineTo(lineEndX, lineY)
    .strokeColor(COLORS.primary)
    .lineWidth(0.5)
    .stroke();

  // Nombre del médico — con su título, que es como firma
  pdf.font("Inter").fontSize(9).fillColor(COLORS.secondary);
  pdf.text(formatNombreMedico(doc.medico_nombre, doc.medico_titulo), lineX, lineY + 5, {
    width: firmaWidth,
    align: "center",
  });

  // Hallazgo 10 — Barcode Code128 de matrícula debajo del nombre
  const barcodeY = lineY + 20;
  try {
    const matriculaBarcode = await generarBarcodePNG(doc.medico_matricula);
    const barcodeWidth = 120;
    const barcodeX = lineX + (firmaWidth - barcodeWidth) / 2;
    pdf.image(matriculaBarcode, barcodeX, barcodeY, { width: barcodeWidth, height: 18 });

    // Matrícula como texto debajo del barcode
    pdf.font("Inter").fontSize(7).fillColor(COLORS.secondary);
    pdf.text(doc.medico_matricula, lineX, barcodeY + 20, {
      width: firmaWidth,
      align: "center",
    });
  } catch {
    // Fallback sin barcode: solo texto matrícula
    pdf.font("Inter").fontSize(8).fillColor(COLORS.secondary);
    pdf.text(doc.medico_matricula, lineX, barcodeY, {
      width: firmaWidth,
      align: "center",
    });
  }
}

// ─── QR code generation ─────────────────────────────────────────────────────

async function generarQRCodePNG(url: string): Promise<Buffer> {
  return QRCode.toBuffer(url, {
    type: "png",
    width: 200,
    margin: 1,
    errorCorrectionLevel: "M",
    color: {
      dark: "#000000",
      light: "#FFFFFF",
    },
  });
}

// ─── Sello visual de firma electrónica ──────────────────────────────────────
// Rediseño RCTA-style: QR de verificación, sin título redundante, sin cita legal
// duplicada, sin hash.
// Se renderiza a la izquierda, a la misma altura que la firma manuscrita (derecha)
//
// POR QUÉ ACÁ NO VA LA FECHA DE FIRMA (dictamen 07/08/2026, segunda parte):
// El papel no declara ninguna fecha de firma. Antes imprimía debajo del QR la
// fecha y hora del sello; con el sellado diferido de los documentos históricos
// eso dejaría dos huellas indeseables: o el documento viejo sale con la fecha de
// hoy bajo el QR, o sale sin ella y esa ausencia lo marca como distinto. El pie
// de un documento sellado tiene que ser IDÉNTICO en los dos casos.
//
// No decir una fecha de firma NO es mentir sobre ella: el pie afirma el mecanismo
// (firma electrónica, art. 5) y el nombre del firmante, verdaderos desde la
// emisión. Y el camino a la verdad completa está impreso a 3 cm: el QR lleva a
// /verificar, donde se muestran SIEMPRE las dos fechas —emisión y sello— con la
// explicación.
//
// Lo clínicamente relevante sigue en el papel: la FECHA DE EMISIÓN con hora, en
// el encabezado (renderHeader). Es la que define la vigencia de una receta y el
// rango de un reposo.

async function renderSelloFirma(
  pdf: PDFKit.PDFDocument,
  firma: FirmaDigitalPDF,
  footerTopY: number,
  branding?: BrandingPDF | null
) {
  const qrSize = 55;
  const selloWidth = qrSize + 16; // QR + padding
  const selloHeight = qrSize + 26; // QR + leyenda + padding
  const selloX = MARGIN.left;
  const selloY = footerTopY - selloHeight - 10;

  // QR code → /verificar/{documento_id}
  const verificarUrl = `${VERIFICAR_BASE_URL}/verificar/${firma.verificar_id}`;

  try {
    const qrBuffer = await generarQRCodePNG(verificarUrl);
    const qrX = selloX + 8;
    const qrY = selloY + 4;

    pdf.image(qrBuffer, qrX, qrY, { width: qrSize, height: qrSize });

    // Para qué sirve el QR, debajo del QR.
    pdf.font("Inter").fontSize(6).fillColor(COLORS.secondary);
    pdf.text(
      "Verificar autenticidad",
      selloX,
      qrY + qrSize + 3,
      { width: selloWidth, align: "center" }
    );
  } catch {
    // Fallback sin QR: la URL de verificación en texto, que es lo que el QR haría.
    pdf.font("Inter").fontSize(7).fillColor(COLORS.secondary);
    pdf.text(
      "Verificá este documento en",
      selloX + 8,
      selloY + 10,
      { width: 180 }
    );
    // El fallback del sello sale GRIS en el documento institucional: la URL de
    // verificación es un dato de verificación, no la marca de la institución, y
    // pintarla con el color del ministerio la haría leer como tal.
    pdf.font("Inter").fontSize(6).fillColor(branding ? COLORS.secondary : COLORS.accent);
    pdf.text(
      `${VERIFICAR_BASE_URL.replace(/^https?:\/\//, "")}/verificar/${firma.verificar_id}`,
      selloX + 8,
      selloY + 22,
      { width: 180 }
    );
  }
}

// Barcode de receta — centrado a pie de página, abajo de todo (después del footer)
async function renderBarcodeReceta(pdf: PDFKit.PDFDocument, nroReceta: string) {
  const barcodeY = pdf.y + 8;

  try {
    const barcodePng = await generarBarcodePNG(nroReceta);
    const barcodeWidth = 140;
    pdf.image(barcodePng, PAGE_WIDTH / 2 - barcodeWidth / 2, barcodeY, {
      width: barcodeWidth,
      height: 18,
    });

    pdf.font("Inter").fontSize(7).fillColor(COLORS.secondary);
    pdf.text(nroReceta, MARGIN.left, barcodeY + 20, {
      width: CONTENT_WIDTH,
      align: "center",
      characterSpacing: 0.5,
    });
  } catch {
    pdf.font("Inter").fontSize(7).fillColor(COLORS.secondary);
    pdf.text(nroReceta, MARGIN.left, barcodeY, {
      width: CONTENT_WIDTH,
      align: "center",
    });
  }
}

// ─── Hallazgo 4 — Footer completo con Sección A + Sección B ──────────────────

function renderFooter(
  pdf: PDFKit.PDFDocument,
  doc: DocumentoPDF,
  esReceta: boolean,
  footerTopY: number,
  branding?: BrandingPDF | null
) {
  let y = footerTopY;

  // ─── Sección A — Leyenda de firma (TODOS los documentos firmados) ───
  // Línea separadora superior
  pdf
    .moveTo(MARGIN.left, y)
    .lineTo(PAGE_WIDTH - MARGIN.right, y)
    .strokeColor(COLORS.border)
    .lineWidth(0.5)
    .stroke();
  y += 6;

  // La leyenda de firma SOLO se imprime si la firma existe de verdad.
  // Antes se imprimía siempre: todo documento afirmaba estar firmado
  // electrónicamente aunque nunca se hubiera sellado. Un documento no puede
  // mentir sobre su propio origen (dictamen 07/08/2026, punto 1).
  //
  // Tampoco se dice "electrónica o digitalmente según corresponda": ese hedge
  // deja ambiguo cuál de los dos regímenes aplica, y esa diferencia es
  // exactamente la presunción de los arts. 7-8 de la Ley 25.506. Es firma
  // ELECTRÓNICA, art. 5, y así se declara.
  //
  // UNA SOLA LEYENDA PARA TODO DOCUMENTO SELLADO (dictamen 07/08/2026, segunda
  // parte). El pie no distingue —ni puede distinguir— un documento sellado al
  // emitirse de uno sellado después: no declara NINGUNA fecha de firma, declara
  // el mecanismo y el firmante, y ambas cosas son verdaderas desde la emisión.
  // La verdad completa (las dos fechas, con explicación) está a un escaneo de
  // distancia, y la segunda línea lo dice explícitamente.
  //
  // La URL va COMPLETA, con el id del documento — la misma que codifica el QR.
  // Antes se imprimía ".../verificar" a secas y esa ruta no existe: devuelve 404.
  // El que no puede escanear (un empleador con el papel, una farmacia sin cámara)
  // la tipeaba y caía en un error, o sea que el papel prometía una vía de
  // verificación que no funcionaba. Y el id no está impreso en ningún otro lado
  // del documento: sin él, un buscador tampoco lo salvaba. Medido: entra en una
  // sola línea a 8pt aun con el host más largo, así que no consume alto de pie.
  if (doc.firma) {
    pdf.font("Inter").fontSize(8).fillColor(COLORS.primary);
    pdf.text(
      `Firmado electrónicamente por ${formatNombreMedico(doc.medico_nombre, doc.medico_titulo)} en los términos del art. 5 de la Ley 25.506.\n` +
        `Verificá este documento escaneando el código QR o en ${VERIFICAR_BASE_URL.replace(/^https?:\/\//, "")}/verificar/${doc.firma.verificar_id}`,
      MARGIN.left, y,
      { width: CONTENT_WIDTH, align: "center" }
    );
  } else {
    // Falla de sellado: el documento se entrega igual, pero marcado.
    // "quien lo emitió" y no "el profesional que lo emitió": la mayoría de las
    // matriculadas de Docto son médicas y el papel no tiene por qué asumir género.
    pdf.font("Inter").fontSize(8).fillColor(COLORS.pendiente);
    pdf.text(
      "Documento sin sello electrónico de verificación. Su autenticidad puede confirmarse con quien lo emitió.",
      MARGIN.left, y,
      { width: CONTENT_WIDTH, align: "center" }
    );
  }
  y = pdf.y + 4;

  pdf.font("Inter").fontSize(8).fillColor(COLORS.primary);
  if (esReceta) {
    // Receta: leyenda del Registro de Recetarios (ReNaPDiS). Es sobre el emisor
    // inscripto, no sobre la firma — va con sello o sin sello.
    const renapdisRL = process.env.RENAPDIS_RL_NUMBER;
    const leyendaRenapdis = renapdisRL
      ? `Esta receta fue creada por un emisor inscripto y validado en el Registro de Recetarios Electrónicos del Ministerio de Salud de la Nación - ${renapdisRL}`
      : `Esta receta fue creada por un emisor inscripto en el Registro de Recetarios Electrónicos del Ministerio de Salud de la Nación — Inscripción en trámite (EX-2026-41816871-APN-SSVEIYES#MS)`;
    pdf.text(leyendaRenapdis, MARGIN.left, y, { width: CONTENT_WIDTH, align: "center" });
    y = pdf.y + 4;
  }
  // Certificado / indicaciones / orden: nada extra acá. El Registro de
  // Recetarios (ReNaPDiS) es específico de recetas y la leyenda de firma ya se
  // resolvió arriba, condicionada al sello real.

  // Línea separadora inferior
  pdf
    .moveTo(MARGIN.left, y)
    .lineTo(PAGE_WIDTH - MARGIN.right, y)
    .strokeColor(COLORS.border)
    .lineWidth(0.5)
    .stroke();
  y += 6;

  // ─── Sección B — Marco regulatorio POR TIPO (letra chica) ───────────
  // Dictamen Carolina: cada documento cita SOLO la norma que lo habilita.
  // NUNCA AAIP/Ley 25.326 ni mezclar las leyendas de receta en otros tipos.
  //
  // Se quitó "Firma electrónica con validez legal según Ley 25.506" de los tres
  // casos: era falsa mientras no había firma y sobreafirmada aun con firma. Un
  // documento no declara su propia validez — declara el mecanismo (Sección A) y
  // deja la validez donde corresponde, que es el derecho.
  //
  // ⚠ EN EL DOCUMENTO INSTITUCIONAL, ESTA SECCIÓN DICE "EMITIDO POR DOCTO".
  // La premisa de la marca blanca es "arriba el ministerio, Docto al pie como
  // EFECTOR TECNOLÓGICO" (Sección C, tres líneas más abajo). Pero esta sección
  // —que no se toca, y está bien que no se toque: son las leyendas
  // dictaminadas— declara a Docto EMISOR del documento. Sobre membrete de un
  // ministerio, el mismo pie afirma dos roles distintos y en tensión.
  //
  // No se resuelve acá: es la decisión pendiente del pie completo, que va al
  // abogado junto al DPA. Y lo que tiene que ver el abogado es el PIE ENTERO
  // en la instancia institucional, no el fragmento nuevo de la Sección C.
  // Detalle en docs/sprints/2026-08-13-institucional-cierre-etapas-0-6.md.
  pdf.font("Inter").fontSize(6.5).fillColor(COLORS.footerText);
  let seccionB: string;
  if (doc.tipo === "receta") {
    seccionB = "Documento emitido por Docto — Plataforma 0270, ReNaPDiS — Ley 27.553 y Decreto 63/2024.";
  } else if (doc.tipo === "certificado") {
    // Normas VERIFICADAS contra fuente oficial (20/06/2026): Ley 27.802 (BO
    // 06/03/2026) y Decreto 407/2026 (BO 01/06/2026, reglamenta el art. 210 LCT).
    // Cita validada por Carolina contra el texto oficial. Pendiente antes del
    // go-live público: revisión de un laboralista matriculado (doc de máxima
    // exposición) + cláusula art. 210 de control del empleador en los T&C.
    seccionB = "Documento emitido por Docto — Plataforma de telemedicina. Certificado médico de reposo laboral emitido conforme al art. 210 de la Ley de Contrato de Trabajo (Ley 20.744, modificado por Ley 27.802) y su Decreto reglamentario 407/2026.";
  } else {
    seccionB = "Documento emitido por Docto — Plataforma de telemedicina habilitada por Ley 27.553.";
  }

  pdf.text(seccionB, MARGIN.left, y, { width: CONTENT_WIDTH, align: "center" });
  y = pdf.y + 2;

  // Disclaimer final (todos)
  pdf.text(
    "Este documento no reemplaza una consulta presencial cuando sea necesaria.",
    MARGIN.left, y,
    { width: CONTENT_WIDTH, align: "center" }
  );

  // ─── Leyenda de DEMOSTRACIÓN (solo cuentas de demo) ───────────────────
  // Va ARRIBA de la Sección C y no al final del todo: el efector tecnológico
  // es letra chica de identificación, y esto es una advertencia. Si alguien
  // recorta el papel por abajo (pasa: se corta el barcode para pegarlo en una
  // planilla), lo que tiene que sobrevivir es la advertencia.
  if (branding?.demo) {
    y = pdf.y + DEMO.gapAntes;
    pdf.font(DEMO.fuente).fontSize(DEMO.cuerpo).fillColor(COLOR_DEMO);
    pdf.text(LEYENDA_DEMO, MARGIN.left, y, { width: CONTENT_WIDTH, align: "center" });
  }

  // ─── Sección C — EFECTOR TECNOLÓGICO (solo documento institucional) ───
  // Acá abajo vive la marca de Docto en el papel de la institución: arriba está
  // el ministerio, y quien emitió técnicamente el documento se declara al pie.
  // Sin logo — texto solo: es más defendible y no compite con el isologo
  // institucional (03-spec §3.2).
  //
  // ⚠ TEXTO PROVISORIO. La redacción final de la identificación del efector la
  // define Diego con el abogado, junto al DPA (spec §11, decisión pendiente 2).
  // Lo que se imprime sale de `institucion_config.pdf_efector_texto`: el día que
  // el abogado entregue el copy definitivo, se cambia el config y NO el código.
  //
  // Las Secciones A y B de arriba NO se tocan ni una coma: son las leyendas
  // dictaminadas (firma electrónica art. 5 Ley 25.506 y marco regulatorio por
  // tipo de documento).
  // El alto de este bloque lo reservó `altoSeccionC()` con las MISMAS
  // constantes: si se toca un gap acá, se toca allá.
  if (branding && branding.efectorTexto.trim()) {
    y = pdf.y + SECCION_C.gapAntes;
    pdf
      .moveTo(MARGIN.left, y)
      .lineTo(PAGE_WIDTH - MARGIN.right, y)
      .strokeColor(COLORS.border)
      .lineWidth(0.5)
      .stroke();
    y += SECCION_C.gapDespues;
    pdf.font(SECCION_C.fuente).fontSize(SECCION_C.cuerpo).fillColor(COLORS.footerText);
    pdf.text(branding.efectorTexto.trim(), MARGIN.left, y, {
      width: CONTENT_WIDTH,
      align: "center",
    });
  }
}
