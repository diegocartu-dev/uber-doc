// ── Manual ilustrado de Nova ──
//
// Registro ESTÁTICO de "cuentitos" de ayuda. Contenido curado, NO generado por IA.
// Cero alucinación, cero tokens. Nova ejecuta este manual, no lo crea.
//
// Diseño completo: docs/nova-manual-ilustrado.md · DECISIONES_PRODUCTO_DOCTO.md §12
//
// REGLAS DE CONTENIDO:
//  - Texto: 1 verbo por paso, ≤140 chars, tono de colega ("vos"), nombres de
//    botones entre comillas tal cual aparecen en la pantalla.
//  - Imágenes: recortes WebP en /public/nova/manual/{id}/{n}.webp, señalador
//    QUEMADO en la foto (azul #378ADD, nunca verde). "armar-turno" ya usa fotos
//    reales (recortes de capturas reales de Docto con el señalador azul).
//  - 3 a 6 pasos por cuentito.

export type CategoriaAyuda =
  | "agenda"
  | "disponibilidad"
  | "consulta"
  | "receta"
  | "tablero"
  | "nova"
  | "perfil";

/** Versión ampliada de un paso, para el botón "No me quedó claro" (curada). */
export type AmpliacionPaso = {
  texto: string;
  /** Lo que Nova DICE en voz (prosa natural, sin comillas/símbolos). Si falta,
   *  se narra `texto` limpiado. */
  narracion?: string;
  imagen?: string;
  alt?: string;
};

export type PasoManual = {
  /** Texto corto del paso que se VE en pantalla (≤140 chars). */
  texto: string;
  /** Lo que Nova DICE en voz. Se separa de `texto` porque el texto visible lleva
   *  comillas, "+", nombres de botones — que leídos en voz suenan horrible. */
  narracion?: string;
  /** Path bajo /public (ej: "/nova/manual/armar-turno/1.webp"). */
  imagen: string;
  /** Texto alternativo accesible de la imagen. */
  alt: string;
  /** Detalle extra curado (Ola 2 — botón "No me quedó claro"). */
  ampliacion?: AmpliacionPaso;
};

export type FuncionAyuda = {
  /** Identificador estable (kebab-case). Usado en el deep link ?walkthrough=. */
  id: string;
  /** Título corto para la grilla / el índice. */
  titulo: string;
  categoria: CategoriaAyuda;
  /** Para que Nova reconozca la pregunta en lenguaje natural. */
  keywords: string[];
  /** Burbuja de apertura antes del paso 1. */
  apertura: string;
  /** Versión hablada de la apertura. */
  aperturaNarracion?: string;
  pasos: PasoManual[];
  cierre: {
    texto: string;
    /** Versión hablada del cierre. */
    narracion?: string;
    /** Encadena al cuentito siguiente. El botón aparece solo si ese id existe. */
    siguiente?: { funcionId: string; label: string };
  };
};

/** Limpia un texto de pantalla para que suene bien leído (fallback si no hay
 *  `narracion` curada): saca emojis/pictogramas, comillas y el "+". */
export function limpiarParaVoz(texto: string): string {
  return texto
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2190}-\u{21FF}️]/gu, "")
    .replace(/[""«»"']/g, "")
    .replace(/\s*\+\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Lo que Nova DICE: la narración curada, o el texto visible limpiado. */
export function vozDe(texto: string, narracion?: string): string {
  return narracion ?? limpiarParaVoz(texto);
}

// ── Registro ──

export const FUNCIONES_AYUDA: FuncionAyuda[] = [
  {
    id: "armar-turno",
    titulo: "Armar un turno",
    categoria: "agenda",
    keywords: [
      "armar turno",
      "crear turno",
      "crear agenda",
      "nueva agenda",
      "armar agenda",
      "configurar agenda",
      "publicar turnos",
      "abrir turnos",
      "agenda",
      "turnos programados",
      "horarios",
      "como armo un turno",
      "como creo turnos",
    ],
    apertura: "Dale, te muestro paso a paso cómo armar tus turnos. Son 6 pantallitas, vas a tu ritmo 👇",
    aperturaNarracion: "Dale, te muestro paso a paso cómo armar tus turnos. Son seis pantallas, vas a tu ritmo.",
    pasos: [
      {
        texto: 'Entrá a "Mi agenda" y tocá el botón "+ Nueva agenda".',
        narracion: "Primero entrá a tu agenda. Vas a ver un botón para crear una nueva agenda, arriba de la lista. Tocá ahí.",
        imagen: "/nova/manual/armar-turno/1.webp",
        alt: 'Pantalla Mi agenda con el botón "+ Nueva agenda" resaltado',
      },
      {
        texto: 'Ponele un nombre que reconozcas, como "Semana laboral". Después elegí la duración y el valor de cada turno.',
        narracion: "Ponele un nombre que reconozcas, como semana laboral. Después elegí cuánto dura cada turno y el valor de la consulta.",
        imagen: "/nova/manual/armar-turno/2.webp",
        alt: "Campos de nombre, duración y valor de la agenda",
      },
      {
        texto: "Marcá desde y hasta qué día querés que valga esta agenda.",
        narracion: "Marcá desde qué día y hasta qué día querés que valga esta agenda.",
        imagen: "/nova/manual/armar-turno/3.webp",
        alt: "Selectores de fecha desde y hasta",
      },
      {
        // El selector real tiene 3 estados por toque (FormularioModelo.tsx:96,337):
        // 1 toque = horario base · 2 toques = personalizado · 3 toques = quitar.
        texto: "Tocá los días que atendés. Un toque deja tu horario de siempre.",
        narracion: "Tocá los días que atendés. Con un solo toque quedan con tu horario de siempre.",
        imagen: "/nova/manual/armar-turno/4.webp",
        alt: "Selector de días de la semana, lunes a viernes marcados",
        ampliacion: {
          texto:
            "Cada día es un botón. Un toque lo deja con tu horario de siempre. Tocalo otra vez y le ponés un horario distinto solo a ese día. Un toque más y lo quitás. No hace falta cargar día por día desde cero.",
          narracion:
            "Cada día es un botón. Con un toque queda con tu horario de siempre. Si lo tocás otra vez, le ponés un horario distinto solo a ese día. Y con un toque más, lo sacás. No hace falta cargar día por día desde cero.",
          imagen: "/nova/manual/armar-turno/4.webp",
          alt: "Detalle del selector de días con un día activo",
        },
      },
      {
        texto: '¿Atendés mañana y tarde? Tocá "+ Agregar franja" y cargá el segundo turno del día.',
        narracion: "¿Atendés a la mañana y a la tarde? Tocá donde dice agregar franja y cargá el segundo horario del día.",
        imagen: "/nova/manual/armar-turno/5.webp",
        alt: 'Botón "+ Agregar franja" para sumar una segunda franja horaria',
      },
      {
        texto: 'Cuando esté todo, tocá "Guardar modelo" y ¡listo! Tus turnos quedan publicados.',
        narracion: "Cuando esté todo, tocá guardar modelo, y listo. Tus turnos quedan publicados.",
        imagen: "/nova/manual/armar-turno/6.webp",
        alt: 'Botón "Guardar modelo" al pie del formulario',
        ampliacion: {
          texto:
            'Antes de guardar: si estos turnos son solo para tu consultorio particular, tildá esa opción. Si no la tocás, quedan publicados en la Clínica Virtual, que es lo más común. Después tocá "Guardar modelo".',
          narracion:
            "Antes de guardar: si estos turnos son solo para tu consultorio particular, tildá esa opción. Si no la tocás, quedan publicados en la clínica virtual, que es lo más común. Después tocá guardar modelo.",
          imagen: "/nova/manual/armar-turno/6.webp",
          alt: 'Checkbox "Estos turnos son solo para mi Consultorio Particular" sobre el botón Guardar modelo',
        },
      },
    ],
    cierre: {
      texto: "¡Ya está! Tus turnos quedaron publicados y los pacientes ya pueden reservar. 🎉",
      narracion: "¡Ya está! Tus turnos quedaron publicados, y los pacientes ya pueden reservar.",
      siguiente: { funcionId: "ponerse-disponible", label: "Ver cómo ponerme disponible" },
    },
  },
];

// ── Lookup ──

const POR_ID = new Map(FUNCIONES_AYUDA.map((f) => [f.id, f]));

export function getFuncion(id: string): FuncionAyuda | undefined {
  return POR_ID.get(id);
}
