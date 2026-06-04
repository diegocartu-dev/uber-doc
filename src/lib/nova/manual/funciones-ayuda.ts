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
//    QUEMADO en la foto (azul #378ADD, nunca verde). Mientras no estén las fotos
//    reales, se usan placeholders .svg con el mismo path base.
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
  imagen?: string;
  alt?: string;
};

export type PasoManual = {
  /** Texto corto del paso (≤140 chars). */
  texto: string;
  /** Path bajo /public (ej: "/nova/manual/armar-turno/1.svg"). */
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
  pasos: PasoManual[];
  cierre: {
    texto: string;
    /** Encadena al cuentito siguiente. El botón aparece solo si ese id existe. */
    siguiente?: { funcionId: string; label: string };
  };
};

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
    pasos: [
      {
        texto: 'Entrá a "Mi agenda" y tocá el botón "+ Nueva agenda".',
        imagen: "/nova/manual/armar-turno/1.svg",
        alt: 'Pantalla Mi agenda con el botón "+ Nueva agenda" resaltado',
      },
      {
        texto: 'Ponele un nombre que reconozcas, como "Semana laboral". Después elegí la duración y el valor de cada turno.',
        imagen: "/nova/manual/armar-turno/2.svg",
        alt: "Campos de nombre, duración y valor de la agenda",
      },
      {
        texto: "Marcá desde y hasta qué día querés que valga esta agenda.",
        imagen: "/nova/manual/armar-turno/3.svg",
        alt: "Selectores de fecha desde y hasta",
      },
      {
        // El selector real tiene 3 estados por toque (FormularioModelo.tsx:96,337):
        // 1 toque = horario base · 2 toques = personalizado · 3 toques = quitar.
        texto: "Tocá los días que atendés. Un toque deja tu horario de siempre.",
        imagen: "/nova/manual/armar-turno/4.svg",
        alt: "Selector de días de la semana, lunes a viernes marcados",
        ampliacion: {
          texto:
            "Cada día es un botón. Un toque lo deja con tu horario de siempre. Tocalo otra vez y le ponés un horario distinto solo a ese día. Un toque más y lo quitás. No hace falta cargar día por día desde cero.",
          imagen: "/nova/manual/armar-turno/4.svg",
          alt: "Detalle del selector de días con un día activo",
        },
      },
      {
        texto: '¿Atendés mañana y tarde? Tocá "+ Agregar franja" y cargá el segundo turno del día.',
        imagen: "/nova/manual/armar-turno/5.svg",
        alt: 'Botón "+ Agregar franja" para sumar una segunda franja horaria',
      },
      {
        texto: 'Cuando esté todo, tocá "Guardar modelo" y ¡listo! Tus turnos quedan publicados.',
        imagen: "/nova/manual/armar-turno/6.svg",
        alt: 'Botón "Guardar modelo" al pie del formulario',
        ampliacion: {
          texto:
            'Antes de guardar: si estos turnos son solo para tu consultorio particular, tildá esa opción. Si no la tocás, quedan publicados en la Clínica Virtual, que es lo más común. Después tocá "Guardar modelo".',
          imagen: "/nova/manual/armar-turno/6.svg",
          alt: 'Checkbox "Estos turnos son solo para mi Consultorio Particular" sobre el botón Guardar modelo',
        },
      },
    ],
    cierre: {
      texto: "¡Ya está! Tus turnos quedaron publicados y los pacientes ya pueden reservar. 🎉",
      siguiente: { funcionId: "ponerse-disponible", label: "Ver cómo ponerme disponible" },
    },
  },
];

// ── Lookup ──

const POR_ID = new Map(FUNCIONES_AYUDA.map((f) => [f.id, f]));

export function getFuncion(id: string): FuncionAyuda | undefined {
  return POR_ID.get(id);
}
