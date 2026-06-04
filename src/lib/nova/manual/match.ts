// ── Matcher local del manual ──
//
// Reconoce si lo que el médico escribió/dictó corresponde a un cuentito del
// manual. 100% local, sin IA, sin red. Si no hay match claro, devuelve null y
// el chat sigue su curso normal (cae a la Nova IA real).
//
// ⚠️ Ola 1: este matcher TODAVÍA NO está cableado en el chat. En esta ola al
// manual se entra solo por deep link (?walkthrough=) o por el botón de
// encadenado. El cableado en enviarMensaje/handleKeyDown (reconocer la pregunta
// en lenguaje natural y los controles por voz) es Ola 2.
//
// Diseño: docs/nova-manual-ilustrado.md §4–5

import { FUNCIONES_AYUDA, type FuncionAyuda } from "./funciones-ayuda";

/** Normaliza: minúsculas, sin acentos, sin signos, espacios colapsados. */
function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[¿?¡!.,;:()"']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Pedidos de control durante un cuentito (no son preguntas para la IA). */
export type ControlManual = "repetir" | "atras" | "siguiente" | "no-entiendo" | "mas-lento" | "salir";

const CONTROL_PATRONES: { control: ControlManual; frases: string[] }[] = [
  { control: "repetir", frases: ["repeti", "repetir", "de nuevo", "otra vez", "no escuche", "volve a decir"] },
  { control: "no-entiendo", frases: ["no entiendo", "no entendi", "no me quedo claro", "no comprendo", "como es"] },
  { control: "mas-lento", frases: ["mas lento", "mas despacio", "mas pausado", "tranquilo", "despacio"] },
  { control: "atras", frases: ["atras", "volver", "anterior", "el paso anterior", "para atras"] },
  { control: "siguiente", frases: ["siguiente", "seguir", "continuar", "dale", "ya esta", "ya se", "listo", "proximo"] },
  { control: "salir", frases: ["salir", "cerrar", "basta", "ya entendi", "gracias"] },
];

/** Detecta un pedido de control. Devuelve null si el texto no es un control. */
export function matchControl(texto: string): ControlManual | null {
  const n = normalizar(texto);
  if (!n) return null;
  for (const { control, frases } of CONTROL_PATRONES) {
    if (frases.some((f) => n === f || n.includes(f))) return control;
  }
  return null;
}

/**
 * Busca el cuentito que mejor matchea la consulta. Devuelve null si ninguno
 * supera el umbral (entonces el chat sigue a la IA real).
 */
export function matchFuncion(texto: string): FuncionAyuda | null {
  const n = normalizar(texto);
  if (n.length < 3) return null;

  let mejor: FuncionAyuda | null = null;
  let mejorScore = 0;

  for (const fn of FUNCIONES_AYUDA) {
    let score = 0;
    for (const kw of fn.keywords) {
      const k = normalizar(kw);
      if (!k) continue;
      // Frase completa contenida → match fuerte.
      if (n.includes(k)) {
        score += k.split(" ").length * 2;
        continue;
      }
      // Todas las palabras de la keyword presentes (en cualquier orden) → match medio.
      const palabras = k.split(" ");
      if (palabras.length > 1 && palabras.every((p) => n.includes(p))) {
        score += palabras.length;
      }
    }
    if (score > mejorScore) {
      mejorScore = score;
      mejor = fn;
    }
  }

  // Umbral: al menos una keyword multi-palabra o dos señales.
  return mejorScore >= 2 ? mejor : null;
}
