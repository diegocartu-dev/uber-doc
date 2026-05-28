// Principios activos controlados — Ley 17.818 (estupefacientes) y Ley 19.303 (psicotrópicos)
// Fuente: ANMAT https://www.argentina.gob.ar/anmat/regulados/controlespecial/listados
// Requieren circuito de trazabilidad especial (Res. 2214/2025) — bloqueados en Docto por decisión conservadora
// Nota: La Res. 2214/2025 + Ley 27.553 habilitan controlados en ReNaPDiS, pero Docto los bloquea hasta
// implementar el circuito completo (constancia de autorización + trazabilidad). Ver ROADMAP item 11f.
// Última actualización: mayo 2026

const CONTROLADOS: string[] = [
  // Benzodiazepinas (Ley 19.303)
  "alprazolam",
  "bromazepam",
  "clobazam",
  "clonazepam",
  "clorazepato",
  "diazepam",
  "estazolam",
  "flunitrazepam",
  "flurazepam",
  "ketazolam",
  "lorazepam",
  "lormetazepam",
  "medazepam",
  "midazolam",
  "nitrazepam",
  "nordazepam",
  "oxazepam",
  "prazepam",
  "temazepam",
  "triazolam",

  // Opioides (Ley 17.818)
  "buprenorfina",
  "codeina",
  "codein",
  "dextropropoxifeno",
  "dihidrocodeina",
  "fentanilo",
  "fentanil",
  "hidrocodona",
  "hidromorfona",
  "metadona",
  "morfina",
  "nalbufina",
  "oxicodona",
  "petidina",
  "meperidina",
  "tapentadol",
  "tramadol",

  // Estimulantes (Ley 19.303)
  "anfetamina",
  "dexanfetamina",
  "lisdexanfetamina",
  "metilfenidato",
  "modafinilo",

  // Barbitúricos (Ley 19.303)
  "fenobarbital",
  "pentobarbital",
  "secobarbital",
  "tiopental",

  // Hipnóticos no-benzodiazepínicos (Ley 19.303)
  "zolpidem",
  "zopiclona",
  "eszopiclona",

  // Otros psicotrópicos controlados
  "pregabalina",
  "gabapentina",
  "carisoprodol",
  "ketamina",
  "propofol",
  "GHB",
  "gamma-hidroxibutirato",

  // Cannabis (régimen especial)
  "cannabidiol",
  "tetrahidrocannabinol",
  "dronabinol",
  "nabilona",
];

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

const CONTROLADOS_NORMALIZADOS = CONTROLADOS.map(normalizar);

export function esControlado(droga: string): boolean {
  const drogaNorm = normalizar(droga);
  return CONTROLADOS_NORMALIZADOS.some(
    (c) => drogaNorm.includes(c) || c.includes(drogaNorm)
  );
}
