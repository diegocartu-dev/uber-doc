// Lista canónica de las 24 jurisdicciones argentinas (23 provincias + CABA) y
// normalización de los valores que devuelve REFEPS (`JurisdMatricula.display`, que en
// nuestros datos llega como "CABA", "Buenos Aires", "Santa Fe", "Córdoba"…) a esa lista.
//
// Fuente ÚNICA compartida por el dropdown de provincia del paciente y el set de
// jurisdicciones del médico, para que matcheen EXACTAMENTE. Si un valor no mapea a una
// provincia real (ej. "Provincial"/"Nacional" sin jurisdicción), NO cuenta como
// jurisdicción válida — se marca para resolver, nunca se usa en silencio (fail-safe).

export const JURISDICCIONES = [
  "CABA",
  "Buenos Aires",
  "Catamarca",
  "Chaco",
  "Chubut",
  "Córdoba",
  "Corrientes",
  "Entre Ríos",
  "Formosa",
  "Jujuy",
  "La Pampa",
  "La Rioja",
  "Mendoza",
  "Misiones",
  "Neuquén",
  "Río Negro",
  "Salta",
  "San Juan",
  "San Luis",
  "Santa Cruz",
  "Santa Fe",
  "Santiago del Estero",
  "Tierra del Fuego",
  "Tucumán",
] as const;

export type Jurisdiccion = (typeof JURISDICCIONES)[number];

function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

// Mapa normalizado → canónica: la lista canónica + alias reales que puede devolver
// REFEPS o tipear el usuario. Ojo: "ciudad de buenos aires" → CABA (no Buenos Aires).
const LOOKUP = new Map<string, Jurisdiccion>();
for (const j of JURISDICCIONES) LOOKUP.set(norm(j), j);
const ALIAS: Record<string, Jurisdiccion> = {
  "ciudad autonoma de buenos aires": "CABA",
  "ciudad de buenos aires": "CABA",
  "capital federal": "CABA",
  "provincia de buenos aires": "Buenos Aires",
  "pcia de buenos aires": "Buenos Aires",
  "tierra del fuego antartida e islas del atlantico sur": "Tierra del Fuego",
  "tierra del fuego, antartida e islas del atlantico sur": "Tierra del Fuego",
};
for (const [k, v] of Object.entries(ALIAS)) LOOKUP.set(norm(k), v);

// Normaliza un valor de jurisdicción (de REFEPS o del usuario) a la lista canónica.
// null si NO es una jurisdicción válida (ej. "Provincial", "Nacional" sin provincia,
// vacío). Esos valores NO habilitan ruteo.
export function normalizarJurisdiccion(
  valor: string | null | undefined
): Jurisdiccion | null {
  if (!valor) return null;
  return LOOKUP.get(norm(valor)) ?? null;
}

type MatriculaREFEPS = { tipo?: string | null; habilitada?: boolean | null };

// Deriva el set de jurisdicciones HABILITADAS de un médico desde `refeps_data.matriculas`.
// Solo cuenta las habilitadas cuyo `tipo` mapea a una jurisdicción canónica.
// `sinResolver` = los `tipo` de matrículas habilitadas que NO mapearon (ej. "Provincial"):
// señal para revisar/backfill manual, NUNCA para esconder al médico (fail-safe).
export function derivarJurisdicciones(
  matriculas: MatriculaREFEPS[] | null | undefined
): { jurisdicciones: Jurisdiccion[]; sinResolver: string[] } {
  const set = new Set<Jurisdiccion>();
  const sinResolver: string[] = [];
  for (const m of matriculas ?? []) {
    if (m?.habilitada !== true) continue;
    const j = normalizarJurisdiccion(m.tipo);
    if (j) set.add(j);
    else if (m.tipo) sinResolver.push(m.tipo);
  }
  return { jurisdicciones: [...set], sinResolver };
}
