"use server";

// Server actions del import de padrón (/admin/padron).
// SOLO instancia institucional: doble guard (flag + admin Docto) por action,
// mismo patrón que /admin/operadores. Escritura vía provisionarPaciente
// (única puerta del alta — spec §5.1).

import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admin-auth";
import { esInstitucional } from "@/lib/instancia";
import { parsearPadronCSV, type FilaPreview } from "@/lib/institucional/padron-csv";
import { provisionarPaciente } from "@/lib/institucional/provisionar";

// El texto del CSV viaja como argumento de server action (límite práctico de
// body ~1 MB en Vercel): alcanza para padrones de decenas de miles de filas.
// Techo defensivo para no comer memoria con un archivo equivocado.
const MAX_CSV_BYTES = 900_000;
const MAX_FILAS = 20_000;

async function guardAdminInstitucionalDocto(): Promise<string | null> {
  if (!esInstitucional()) return null; // en B2C estas actions no existen
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !(await isAdmin(user.id))) return null;
  return user.id;
}

export interface PreviewImport {
  ok: boolean;
  error?: string;
  total: number;
  validas: number;
  invalidas: number;
  /** Todas las filas con error + una muestra de las OK (la tabla de preview). */
  filas: { linea: number; ok: boolean; resumen: string; error?: string }[];
}

/** Fase 1 — SOLO parsea y valida. No escribe nada. */
export async function previsualizarPadron(csvTexto: string): Promise<PreviewImport> {
  const uid = await guardAdminInstitucionalDocto();
  if (!uid) return { ok: false, error: "No autorizado", total: 0, validas: 0, invalidas: 0, filas: [] };

  if (new TextEncoder().encode(csvTexto).length > MAX_CSV_BYTES) {
    return { ok: false, error: "El archivo supera el tamaño máximo (~900 KB). Partilo en tandas.", total: 0, validas: 0, invalidas: 0, filas: [] };
  }

  const parseo = parsearPadronCSV(csvTexto);
  if (!parseo.ok) {
    return { ok: false, error: parseo.error, total: 0, validas: 0, invalidas: 0, filas: [] };
  }
  if (parseo.filas.length > MAX_FILAS) {
    return { ok: false, error: `El archivo tiene ${parseo.filas.length} filas (máximo ${MAX_FILAS} por import). Partilo en tandas.`, total: 0, validas: 0, invalidas: 0, filas: [] };
  }

  const resumenFila = (f: FilaPreview) =>
    f.datos
      ? `${f.datos.nombre_completo} — DNI ${f.datos.dni}${f.datos.localidad ? ` · ${f.datos.localidad}` : ""}${f.datos.celular ? " · cel ✓" : f.datos.email ? " · mail ✓" : " · SIN canal"}`
      : "";

  const invalidas = parseo.filas.filter((f) => !f.ok);
  const validas = parseo.filas.filter((f) => f.ok);

  return {
    ok: true,
    total: parseo.filas.length,
    validas: validas.length,
    invalidas: invalidas.length,
    filas: [
      // Errores SIEMPRE completos (es lo que hay que corregir) + muestra de OK.
      ...invalidas.map((f) => ({ linea: f.linea, ok: false, resumen: "", error: f.error })),
      ...validas.slice(0, 50).map((f) => ({ linea: f.linea, ok: true, resumen: resumenFila(f) })),
    ],
  };
}

export interface ReporteImport {
  ok: boolean;
  error?: string;
  creados: number;
  actualizados: number;
  fallidos: { linea: number; error: string }[];
  salteados: number; // filas inválidas de la preview (no se intentan)
  /** Índice (exclusivo) hasta donde llegó ESTA tanda dentro del archivo. */
  procesadasHasta: number;
  totalFilas: number;
  /** false = quedan tandas: el cliente vuelve a llamar con desdeFila = procesadasHasta. */
  terminado: boolean;
}

/**
 * Fase 2 — ejecuta el import POR TANDAS (hallazgo revisión Etapa 2): cada alta
 * son 2–4 round-trips a Supabase, y un padrón real de miles de filas en una
 * sola invocación excedía el timeout de Vercel a mitad de camino, perdiendo el
 * reporte. El cliente llama en loop con `desdeFila` hasta `terminado:true` y
 * acumula; si una tanda falla, el re-intento es seguro (alta idempotente por
 * DNI). Se re-parsea server-side en cada tanda: el offset es sobre el MISMO
 * archivo (los índices de parseo son deterministas).
 */
const TANDA_FILAS = 200;

export async function ejecutarImportPadron(
  csvTexto: string,
  nombreArchivo: string,
  desdeFila: number = 0
): Promise<ReporteImport> {
  const vacio = { creados: 0, actualizados: 0, fallidos: [], salteados: 0, procesadasHasta: 0, totalFilas: 0, terminado: true };
  const uid = await guardAdminInstitucionalDocto();
  if (!uid) return { ok: false, error: "No autorizado", ...vacio };

  if (new TextEncoder().encode(csvTexto).length > MAX_CSV_BYTES) {
    return { ok: false, error: "El archivo supera el tamaño máximo.", ...vacio };
  }

  const parseo = parsearPadronCSV(csvTexto);
  if (!parseo.ok) {
    return { ok: false, error: parseo.error, ...vacio };
  }
  if (parseo.filas.length > MAX_FILAS) {
    return { ok: false, error: "Demasiadas filas para un solo import.", ...vacio };
  }

  const desde = Number.isInteger(desdeFila) && desdeFila > 0 ? desdeFila : 0;
  const hasta = Math.min(desde + TANDA_FILAS, parseo.filas.length);

  let creados = 0;
  let actualizados = 0;
  const fallidos: { linea: number; error: string }[] = [];
  let salteados = 0;

  for (const fila of parseo.filas.slice(desde, hasta)) {
    if (!fila.ok || !fila.datos) {
      salteados++;
      continue;
    }
    const res = await provisionarPaciente(fila.datos, {
      via: "csv",
      // Sin PII en el detalle: solo quién y desde qué archivo.
      detalle: { admin_user_id: uid, archivo: nombreArchivo.slice(0, 120) },
    });
    if (!res.ok) {
      fallidos.push({ linea: fila.linea, error: res.error });
    } else if (res.accion === "creado") {
      creados++;
    } else {
      actualizados++;
    }
  }

  return {
    ok: true,
    creados,
    actualizados,
    fallidos,
    salteados,
    procesadasHasta: hasta,
    totalFilas: parseo.filas.length,
    terminado: hasta >= parseo.filas.length,
  };
}
