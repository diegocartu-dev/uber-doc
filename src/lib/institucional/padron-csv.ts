// src/lib/institucional/padron-csv.ts
// Parser PURO del CSV de padrón (import desde /admin/padron) — sin DB ni env:
// testeable con node:test y reusable por cualquier entrada futura.
//
// Formato esperado (header obligatorio, delimitador ',' o ';' autodetectado):
//   dni,nombre,fecha_nacimiento,sexo,localidad,celular,email
// El orden de columnas es libre (se mapea por nombre de header). `sexo` acepta
// masculino/femenino/M/F. Fechas AAAA-MM-DD. Celular en cualquier formato AR
// (se normaliza a E.164 en la validación).

import {
  validarDatosProvision,
  type DatosProvision,
  type DatosProvisionRaw,
} from "@/lib/institucional/provisionar";

export interface FilaPreview {
  /** Número de línea del archivo (1-based, contando el header). */
  linea: number;
  ok: boolean;
  datos?: DatosProvision;
  error?: string;
}

export interface ResultadoParseo {
  ok: boolean;
  error?: string; // error estructural (header inválido, archivo vacío)
  filas: FilaPreview[];
}

const HEADERS_VALIDOS: Record<string, keyof DatosProvisionRaw> = {
  dni: "dni",
  nombre: "nombre_completo",
  nombre_completo: "nombre_completo",
  fecha_nacimiento: "fecha_nacimiento",
  nacimiento: "fecha_nacimiento",
  sexo: "sexo_dni",
  sexo_dni: "sexo_dni",
  localidad: "localidad",
  celular: "celular",
  telefono: "celular",
  email: "email",
  mail: "email",
};

const OBLIGATORIOS: (keyof DatosProvisionRaw)[] = ["dni", "nombre_completo", "fecha_nacimiento"];

/** Split de una línea CSV respetando comillas dobles. */
function splitCSV(linea: string, delim: string): string[] {
  const out: string[] = [];
  let actual = "";
  let enComillas = false;
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i];
    if (enComillas) {
      if (c === '"' && linea[i + 1] === '"') {
        actual += '"';
        i++;
      } else if (c === '"') {
        enComillas = false;
      } else {
        actual += c;
      }
    } else if (c === '"') {
      enComillas = true;
    } else if (c === delim) {
      out.push(actual);
      actual = "";
    } else {
      actual += c;
    }
  }
  out.push(actual);
  return out.map((s) => s.trim());
}

/**
 * Parsea el CSV completo y valida CADA fila con la misma regla del alta
 * unitaria (una sola fuente de verdad: validarDatosProvision). No escribe nada:
 * la preview se muestra ANTES de ejecutar (regla del ticket — nada de imports a
 * ciegas).
 */
export function parsearPadronCSV(texto: string): ResultadoParseo {
  const lineas = texto
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l, i) => ({ n: i + 1, raw: l }))
    .filter((l) => l.raw.trim() !== "");

  if (lineas.length === 0) return { ok: false, error: "El archivo está vacío.", filas: [] };

  // Delimitador: el que más aparece en el header.
  const headerRaw = lineas[0].raw;
  const delim = (headerRaw.match(/;/g)?.length ?? 0) > (headerRaw.match(/,/g)?.length ?? 0) ? ";" : ",";

  const headers = splitCSV(headerRaw, delim).map((h) =>
    h
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, "_")
  );
  const mapa: (keyof DatosProvisionRaw | null)[] = headers.map((h) => HEADERS_VALIDOS[h] ?? null);

  const presentes = new Set(mapa.filter(Boolean));
  const faltantes = OBLIGATORIOS.filter((c) => !presentes.has(c));
  if (faltantes.length > 0) {
    return {
      ok: false,
      error: `Faltan columnas obligatorias en el header: ${faltantes.join(", ")}. Esperado: dni, nombre, fecha_nacimiento (y opcionales: sexo, localidad, celular, email).`,
      filas: [],
    };
  }

  if (lineas.length === 1) {
    return { ok: false, error: "El archivo solo tiene el header, sin filas.", filas: [] };
  }

  const filas: FilaPreview[] = [];
  const dnisVistos = new Map<string, number>(); // dni → línea de la primera aparición

  for (const { n, raw } of lineas.slice(1)) {
    const celdas = splitCSV(raw, delim);
    const registro: Partial<DatosProvisionRaw> = {};
    mapa.forEach((campo, i) => {
      if (campo && celdas[i] !== undefined) registro[campo] = celdas[i];
    });

    const val = validarDatosProvision(registro as DatosProvisionRaw);
    if (!val.ok) {
      filas.push({ linea: n, ok: false, error: val.error });
      continue;
    }

    // Duplicado DENTRO del archivo: la segunda aparición se marca (ejecutarla
    // sería un update de contacto inmediato de la primera — confuso; mejor que
    // el operador limpie el archivo).
    const primera = dnisVistos.get(val.datos.dni);
    if (primera !== undefined) {
      filas.push({ linea: n, ok: false, error: `DNI repetido en el archivo (ya aparece en la línea ${primera}).` });
      continue;
    }
    dnisVistos.set(val.datos.dni, n);

    filas.push({ linea: n, ok: true, datos: val.datos });
  }

  return { ok: true, filas };
}
