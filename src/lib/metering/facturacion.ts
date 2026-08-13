// src/lib/metering/facturacion.ts
// LA FACTURA DEL MES: cuántas consultas facturables hubo en un período y
// cuánto suman (spec institucional §6.5). SOLO instancia institucional.
//
// ── POR QUÉ NO SE REUSA NADA DE /insights ────────────────────────────────────
// El tablero del B2C tiene dos módulos que a primera vista servirían y no
// sirven:
//   · `src/lib/insights/plata.ts` gira alrededor de `mp_status`, fees y netos
//     de Mercado Pago. Acá NO hay Mercado Pago: el paciente no paga, la
//     institución factura contra un precio por consulta que vive en el config.
//   · `src/lib/insights/reservas.ts` existe por `reservado_pendiente` y la
//     retención de 15 minutos para pagar — un estado que esta instancia jamás
//     produce, porque no hay checkout que esperar.
// Traer cualquiera de los dos sería arrastrar un modelo de plata que no aplica
// y que en la primera lectura confundiría a quien audite la factura.
//
// Lo que sí es: un count con nombre.

import { createAdminClient } from "@/lib/supabase/admin";
import { getConfigInstitucion } from "@/lib/institucional/config";
import { contarExacto, leerTodo, leerTodoEnLotes } from "@/lib/metering/db";
import type { Motor } from "@/lib/metering/clasificar";

export interface LineaFacturacion {
  fecha_ar: string;
  tipo: "consulta" | "turno";
  recurso_id: string;
  motor: Motor;
  especialidad: string | null;
  profesional: string;
  segundos_ambos_en_sala: number;
  documentos_emitidos: number;
  precio_centavos: number;
}

export interface Facturacion {
  periodo: string; // "AAAA-MM"
  consultas: number;
  precio_centavos: number;
  total_centavos: number;
  lineas: LineaFacturacion[];
}

/** ¿"2026-10" es un período válido? El parámetro viene de la URL. */
export function periodoValido(periodo: string): boolean {
  if (!/^\d{4}-\d{2}$/.test(periodo)) return false;
  const mes = Number(periodo.slice(5, 7));
  return mes >= 1 && mes <= 12;
}

/** Primer y último día AR de ese mes, como "AAAA-MM-DD". */
export function rangoDePeriodo(periodo: string): { desde: string; hasta: string } {
  const anio = Number(periodo.slice(0, 4));
  const mes = Number(periodo.slice(5, 7));
  const ultimo = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  return { desde: `${periodo}-01`, hasta: `${periodo}-${String(ultimo).padStart(2, "0")}` };
}

/** "2026-10" → "Octubre" (el título de la card de facturación). */
export function nombreDePeriodo(periodo: string): string {
  const { desde } = rangoDePeriodo(periodo);
  const nombre = new Date(`${desde}T12:00:00Z`).toLocaleDateString("es-AR", {
    month: "long",
    timeZone: "UTC",
  });
  return nombre.charAt(0).toUpperCase() + nombre.slice(1);
}

/** El período AR de hoy ("AAAA-MM"). */
export function periodoDeHoy(ahoraMs = Date.now()): string {
  return new Date(ahoraMs - 3 * 3600_000).toISOString().slice(0, 7);
}

/** Centavos → "$ 1.234.500" (sin decimales: los precios del contrato son enteros). */
export function pesos(centavos: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(Math.round(centavos / 100));
}

/**
 * Todo lo facturable del período, línea por línea.
 *
 * `detalle: false` (default del KPI) devuelve solo el conteo y el total —
 * el panel muestra un número, no necesita traerse el mes entero.
 *
 * ── CÓMO SE CUENTA, Y POR QUÉ ASÍ ────────────────────────────────────────────
 * El KPI cuenta con `count: 'exact'` en el servidor y el detalle pagina con
 * `.range()` hasta agotar. Antes contaba `filas.length` de un select sin tope:
 * PostgREST corta en 1000 filas sin avisar, así que un mes grande subfacturaba
 * en silencio — y como el CSV y el KPI salen de la misma función, la
 * verificación obvia ("el CSV suma lo mismo que el panel") daba OK con los dos
 * mal. Detalle del hallazgo en `src/lib/metering/db.ts`.
 *
 * TIRA si la base falla: una factura vacía por un timeout se ve exactamente
 * igual que un mes sin actividad, y esa confusión se paga discutiendo con el
 * cliente.
 */
export async function facturacionDePeriodo(
  periodo: string,
  opciones?: { detalle?: boolean }
): Promise<Facturacion> {
  const admin = createAdminClient();
  const config = await getConfigInstitucion();
  const precio = Number(config.precio_consulta_centavos);
  const { desde, hasta } = rangoDePeriodo(periodo);

  if (!opciones?.detalle) {
    const consultas = await contarExacto(`facturación de ${periodo}`, () =>
      admin
        .from("encuentros_metering")
        .select("id", { count: "exact", head: true })
        .eq("clasificacion", "facturable")
        .gte("fecha_ar", desde)
        .lte("fecha_ar", hasta)
    );
    return {
      periodo,
      consultas,
      precio_centavos: precio,
      total_centavos: consultas * precio,
      lineas: [],
    };
  }

  const filas = await leerTodo<Record<string, unknown>>(
    `detalle de facturación de ${periodo}`,
    (dsd, hst) =>
      admin
        .from("encuentros_metering")
        .select(
          "fecha_ar, tipo, recurso_id, motor, especialidad, medico_id, segundos_ambos_en_sala, documentos_emitidos"
        )
        .eq("clasificacion", "facturable")
        .gte("fecha_ar", desde)
        .lte("fecha_ar", hasta)
        // `fecha_ar` sola no es un orden total (hay muchas por día): sin el
        // desempate por `id`, paginar por rango duplicaría filas y saltearía otras.
        .order("fecha_ar", { ascending: true })
        .order("id", { ascending: true })
        .range(dsd, hst)
  );
  const consultas = filas.length;
  const base = {
    periodo,
    consultas,
    precio_centavos: precio,
    total_centavos: consultas * precio,
  };

  // Nombre del profesional para el detalle: una query, no una por línea.
  const medicoIds = [...new Set(filas.map((f) => f.medico_id as string).filter(Boolean))];
  const nombres = new Map<string, string>();
  const medicos = await leerTodoEnLotes<Record<string, unknown>>(
    "nombres de los profesionales de la factura",
    medicoIds,
    (lote, dsd, hst) =>
      admin
        .from("medicos")
        .select("id, nombre_completo, titulo")
        .in("id", lote)
        .order("id", { ascending: true })
        .range(dsd, hst)
  );
  for (const m of medicos) {
    nombres.set(
      m.id as string,
      `${((m.titulo as string | null) ?? "").trim()} ${((m.nombre_completo as string | null) ?? "").trim()}`.trim()
    );
  }

  return {
    ...base,
    lineas: filas.map((f) => ({
      fecha_ar: f.fecha_ar as string,
      tipo: f.tipo as "consulta" | "turno",
      recurso_id: f.recurso_id as string,
      motor: f.motor as Motor,
      especialidad: (f.especialidad as string | null) ?? null,
      profesional: nombres.get(f.medico_id as string) ?? "",
      segundos_ambos_en_sala: Number(f.segundos_ambos_en_sala ?? 0),
      documentos_emitidos: Number(f.documentos_emitidos ?? 0),
      precio_centavos: precio,
    })),
  };
}

/** Escapa un valor para CSV (comillas dobles, comas y saltos de línea). */
function celda(valor: string | number): string {
  const s = String(valor ?? "");
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * El CSV de la factura — SERVER-SIDE (spec §6.5).
 *
 * No se arma en el navegador como el export de `/admin/consultas`: ese
 * exporta lo que la pantalla tenía paginado, y una factura que dependa del
 * scroll del que la descargó no es una factura. Acá el archivo se arma con la
 * consulta completa del período.
 *
 * Separador `;` y BOM: es lo que abre bien en el Excel en español que va a
 * usar la administración de la institución.
 */
export function facturacionACSV(f: Facturacion): string {
  const filas = [
    ["fecha", "tipo", "id", "motor", "especialidad", "profesional", "segundos_en_sala", "documentos", "precio"],
    ...f.lineas.map((l) => [
      l.fecha_ar,
      l.tipo === "turno" ? "Turno" : "Consulta inmediata",
      l.recurso_id,
      l.motor,
      l.especialidad ?? "",
      l.profesional,
      l.segundos_ambos_en_sala,
      l.documentos_emitidos,
      (l.precio_centavos / 100).toFixed(2),
    ]),
    [],
    ["TOTAL", "", "", "", "", "", "", f.consultas, (f.total_centavos / 100).toFixed(2)],
  ];
  return "﻿" + filas.map((r) => r.map(celda).join(";")).join("\r\n") + "\r\n";
}
