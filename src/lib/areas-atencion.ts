// Áreas de atención adicionales del médico (decisión Diego 07/08/2026).
//
// Nació de un pedido real: la Dra. Noelia Salva se registró en Pediatría y pidió
// figurar como "Pediatra especialista en Adolescencia".
//
// Decisión: NO es una especialidad nueva de la lista (fragmentaría la búsqueda del
// paciente). Es un ÁREA ADICIONAL que el médico activa SOBRE su especialidad, con un
// rango de edad que declara él mismo. Sirve para CUALQUIER especialidad que quiera
// declarar a quién atiende, no solo pediatría.
//
// El rango de edad es INFORMATIVO: le dice al paciente a quién atiende ese médico.
// NO es un candado — en ningún lado se bloquea una reserva o una consulta por la edad
// del paciente. Si algún día se quisiera bloquear, sería una decisión de producto
// aparte, con su propio gate.
//
// Fuente ÚNICA de la lista de áreas (perfil del médico + clínica + perfil público).
// Para sumar un área nueva alcanza con agregarla a AREAS_ATENCION.

export const EDAD_MIN = 0;
export const EDAD_MAX = 120;

export type AreaDefinicion = {
  /** Id estable que se guarda en la base. NUNCA se renombra (romperia los datos). */
  id: string;
  /** Como se llama el área en el perfil del médico. */
  etiqueta: string;
  /** Ayuda corta debajo del título, en criollo. */
  descripcion: string;
  /** Rango que se propone al activarla (el médico lo puede cambiar). */
  sugerido: { desde: number; hasta: number };
  /** Sustantivo para la frase que ve el paciente: "Atiende adolescentes (…)". */
  aQuienAtiende: string;
  /** Palabras con las que el paciente puede buscar esta área en la clínica. */
  sinonimos: string[];
};

export const AREAS_ATENCION: AreaDefinicion[] = [
  {
    id: "adolescencia",
    etiqueta: "Adolescencia",
    descripcion:
      "Se muestra en tu ficha además de tu especialidad. Vos elegís las edades que atendés.",
    sugerido: { desde: 10, hasta: 19 },
    aQuienAtiende: "adolescentes",
    sinonimos: ["adolescencia", "adolescente", "adolescentes", "hebiatria", "pubertad", "joven", "jovenes"],
  },
];

/** Lo que se guarda por área en `medicos.areas_atencion` (jsonb, array de estos objetos). */
export type AreaAtencion = {
  area: string;
  edad_desde: number;
  edad_hasta: number;
};

export function definicionArea(id: string): AreaDefinicion | null {
  return AREAS_ATENCION.find((a) => a.id === id) ?? null;
}

function esEnteroEnRango(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= EDAD_MIN && v <= EDAD_MAX;
}

/**
 * Lectura TOLERANTE de lo que vino de la base (jsonb) o de un cliente viejo.
 * Descarta en silencio todo lo que no sea un área conocida con un rango sano: el dato
 * es decorativo, así que ante basura preferimos no mostrar nada antes que romper la
 * pantalla del paciente. La validación con mensajes de error vive en `validarAreas`.
 */
export function parsearAreasAtencion(raw: unknown): AreaAtencion[] {
  if (!Array.isArray(raw)) return [];
  const vistas = new Set<string>();
  const out: AreaAtencion[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const area = typeof o.area === "string" ? o.area.trim() : "";
    if (!area || !definicionArea(area) || vistas.has(area)) continue;
    const desde = o.edad_desde;
    const hasta = o.edad_hasta;
    if (!esEnteroEnRango(desde) || !esEnteroEnRango(hasta) || desde >= hasta) continue;
    vistas.add(area);
    out.push({ area, edad_desde: desde, edad_hasta: hasta });
  }
  return out;
}

/**
 * Validación con mensajes para humanos (los usa el perfil del médico y el endpoint).
 * Devuelve el primer problema encontrado, o null si está todo bien.
 */
export function validarAreas(areas: AreaAtencion[]): string | null {
  if (!Array.isArray(areas)) return "No pudimos leer las áreas de atención.";
  const vistas = new Set<string>();
  for (const a of areas) {
    const def = definicionArea(a?.area);
    if (!def) return "Esa área de atención no existe.";
    if (vistas.has(a.area)) return `Cargaste ${def.etiqueta} dos veces.`;
    vistas.add(a.area);
    if (!Number.isInteger(a.edad_desde) || !Number.isInteger(a.edad_hasta)) {
      return `Completá las dos edades de ${def.etiqueta} con números enteros (por ejemplo, 10 y 19).`;
    }
    if (
      a.edad_desde < EDAD_MIN ||
      a.edad_desde > EDAD_MAX ||
      a.edad_hasta < EDAD_MIN ||
      a.edad_hasta > EDAD_MAX
    ) {
      return `Las edades de ${def.etiqueta} tienen que estar entre ${EDAD_MIN} y ${EDAD_MAX} años.`;
    }
    if (a.edad_desde >= a.edad_hasta) {
      return `En ${def.etiqueta}, la edad "desde" tiene que ser menor que la edad "hasta".`;
    }
  }
  return null;
}

/** Texto que ve el paciente: "Atiende adolescentes (10 a 19 años)". */
export function textoArea(a: AreaAtencion): string | null {
  const def = definicionArea(a.area);
  if (!def) return null;
  return `Atiende ${def.aQuienAtiende} (${a.edad_desde} a ${a.edad_hasta} años)`;
}

export function textosAreas(areas: AreaAtencion[] | undefined | null): string[] {
  return (areas ?? []).map(textoArea).filter((t): t is string => t !== null);
}

/** Serialización estable (ordenada por id) para comparar "¿cambió algo?" sin falsos positivos. */
export function serializarAreas(areas: AreaAtencion[] | undefined | null): string {
  return JSON.stringify(
    [...(areas ?? [])]
      .map((a) => ({ area: a.area, edad_desde: a.edad_desde, edad_hasta: a.edad_hasta }))
      .sort((x, y) => (x.area < y.area ? -1 : x.area > y.area ? 1 : 0))
  );
}

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/**
 * ¿Este médico aparece cuando el paciente busca "adolescencia" / "adolescentes"?
 * Se matchea contra la etiqueta y los sinónimos del área declarada. No reemplaza al
 * filtro por especialidad ni al de jurisdicción: SUMA resultados, no saca ninguno.
 */
export function areasCoincidenBusqueda(
  areas: AreaAtencion[] | undefined | null,
  termino: string
): boolean {
  const t = normalizar(termino).trim();
  if (!t) return false;
  for (const a of areas ?? []) {
    const def = definicionArea(a.area);
    if (!def) continue;
    const heno = normalizar([def.etiqueta, ...def.sinonimos].join(" "));
    if (heno.includes(t)) return true;
  }
  return false;
}
