// El buzón de Sara — lo que manda y cómo se lee. Módulo PURO (sin base ni red):
// lo usan la ruta que recibe los contactos, la Bandeja y sus pruebas.
//
// ── QUÉ ES (pedido de AC Ai, decidido por Diego 12/10/2026) ─────────────────
// Sara es la secretaria de pacientes que atiende AC Ai. Cuando un contacto lo
// tiene que seguir una persona, lo deja en el panel:
//   · una INSTITUCIÓN interesada (clínica, obra social, municipio, empresa);
//   · un PROFESIONAL que el registro web todavía no admite (hoy, psicólogos).
// No es un mail. Va en una pestaña propia de la Bandeja, separada de soporte.
//
// Las reglas son las mismas que ya aplicaba el buzón de la demo de Sara, para
// que cambie de destino sin cambiar su conducta: sin la aceptación de la persona
// no entra nada, el mail tiene que parecer un mail y el teléfono tener la
// característica. Los mensajes de error los lee Sara para volver a preguntar.
//
// Lo que NO puede entrar nunca —datos de salud, el motivo de consulta de un
// paciente— lo garantiza Sara, no este archivo. Acá solo se acota: los campos
// que no están en la lista se descartan y el interés tiene tope.

export type TipoContactoSara = "institucion" | "profesional";

export interface ContactoSara {
  tipo: TipoContactoSara;
  nombre: string;
  institucion: string;
  profesion: string;
  mail: string;
  telefono: string;
  interes: string;
  acepta_contacto: true;
  /** Cuándo lo recibió Sara (ISO). Si no lo manda, la hora en que llegó acá. */
  recibido: string;
}

export type ResultadoSara =
  | { ok: true; contacto: ContactoSara; idExterno: string | null }
  | { ok: false; error: string };

const MAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Topes de largo. Los mismos de la demo de Sara. */
export const TOPE_TEXTO = 120;
export const TOPE_INTERES = 300;
const TOPE_TELEFONO = 40;
const TOPE_ID_EXTERNO = 100;

/**
 * Recorta por caracteres COMPLETOS. Un `.slice` cuenta unidades UTF-16: si el tope
 * cae en la mitad de un emoji queda medio carácter suelto, y Postgres rechaza ese
 * JSON entero ("Unicode low surrogate must follow a high surrogate"). El insert
 * fallaría siempre igual en cada reintento y el contacto se perdería. Por la misma
 * razón se descartan las mitades sueltas que vengan ya en el JSON de Sara.
 */
function sinMitadesSueltas(s: string): string {
  return Array.from(s)
    .filter((ch) => !(ch.length === 1 && ch.charCodeAt(0) >= 0xd800 && ch.charCodeAt(0) <= 0xdfff))
    .join("");
}

function texto(cuerpo: Record<string, unknown>, k: string, max = TOPE_TEXTO): string {
  const v = cuerpo[k];
  if (typeof v !== "string") return "";
  const limpio = sinMitadesSueltas(v).trim().replace(/\s+/g, " ");
  return Array.from(limpio).slice(0, max).join("").trim();
}

/**
 * Valida lo que manda Sara y devuelve SOLO los campos del contrato. Cualquier
 * otro campo del cuerpo se descarta: no se guarda lo que no se pidió.
 */
export function validarContactoSara(cuerpo: unknown, ahora: Date = new Date()): ResultadoSara {
  if (!cuerpo || typeof cuerpo !== "object" || Array.isArray(cuerpo)) {
    return { ok: false, error: "El cuerpo tiene que ser un objeto JSON." };
  }
  const c = cuerpo as Record<string, unknown>;

  if (c.acepta_contacto !== true) {
    return { ok: false, error: "Falta que la persona acepte ser contactada." };
  }
  if (c.tipo !== "institucion" && c.tipo !== "profesional") {
    return { ok: false, error: "El tipo tiene que ser 'institucion' o 'profesional'." };
  }
  const tipo = c.tipo;

  const nombre = texto(c, "nombre");
  if (!nombre) return { ok: false, error: "Falta el nombre." };

  const institucion = texto(c, "institucion");
  const profesion = texto(c, "profesion");
  if (tipo === "institucion" && !institucion) {
    return { ok: false, error: "Falta el nombre de la institución." };
  }
  if (tipo === "profesional" && !profesion) {
    return { ok: false, error: "Falta la profesión." };
  }

  const mail = texto(c, "mail").toLowerCase();
  if (!MAIL_RE.test(mail)) {
    return { ok: false, error: "El mail no parece válido: pedilo de nuevo." };
  }

  // Se guarda con los separadores que traiga (se lee mejor), pero se cuentan
  // los dígitos: sin característica no se puede llamar.
  const telefono = texto(c, "telefono", TOPE_TELEFONO)
    .replace(/[^\d+()\s-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (telefono.replace(/\D/g, "").length < 8) {
    return { ok: false, error: "Al teléfono le faltan dígitos: pedilo con característica." };
  }

  const interes = texto(c, "interes", TOPE_INTERES);

  // `recibido` de Sara solo si es una fecha de verdad; si no, la nuestra.
  const recibidoCrudo = typeof c.recibido === "string" ? Date.parse(c.recibido) : NaN;
  const recibido = Number.isNaN(recibidoCrudo) ? ahora.toISOString() : new Date(recibidoCrudo).toISOString();

  const idCrudo = texto(c, "id_externo", TOPE_ID_EXTERNO);
  const idExterno = idCrudo || null;

  return {
    ok: true,
    idExterno,
    contacto: { tipo, nombre, institucion, profesion, mail, telefono, interes, acepta_contacto: true, recibido },
  };
}

/** "Institución" o "Profesional", como se lee en la Bandeja. */
export function etiquetaTipo(tipo: TipoContactoSara): string {
  return tipo === "institucion" ? "Institución" : "Profesional";
}

/** De dónde viene: la institución, o la profesión si es un profesional. */
export function procedencia(c: Pick<ContactoSara, "tipo" | "institucion" | "profesion">): string {
  return c.tipo === "institucion" ? c.institucion : c.profesion;
}

/** El asunto de la fila: se ve en el detalle y en cualquier vista genérica de la tabla. */
export function asuntoSara(c: ContactoSara): string {
  return `${etiquetaTipo(c.tipo)} · ${procedencia(c) || c.nombre}`;
}

/** El contacto en texto plano, por si alguien lo lee fuera de la ficha. */
export function cuerpoSara(c: ContactoSara): string {
  return [
    `Tipo: ${etiquetaTipo(c.tipo)}`,
    `Nombre: ${c.nombre}`,
    c.institucion ? `Institución: ${c.institucion}` : null,
    c.profesion ? `Profesión: ${c.profesion}` : null,
    `Mail: ${c.mail}`,
    `Teléfono: ${c.telefono}`,
    c.interes ? `Interés: ${c.interes}` : null,
    "Aceptó ser contactado/a: sí",
  ]
    .filter(Boolean)
    .join("\n");
}
