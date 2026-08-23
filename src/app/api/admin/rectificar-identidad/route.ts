import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  evaluarRectificacionIdentidad,
  rectificarIdentidadDocumento,
  TIPOS_FIRMABLES,
} from "@/lib/firma/documento";

/**
 * Rectificación de la identidad del paciente en documentos ya sellados —
 * ejecución DENTRO de producción (camino 5, src/lib/firma/documento.ts).
 *
 * Igual que `sellar-historicos`: la clave maestra que protege las claves de los
 * profesionales (`FIRMA_MASTER_KEY`) vive en Vercel y no se lee de vuelta, así
 * que el re-sellado tiene que correr donde esa clave está: acá. Protegido con
 * CRON_SECRET, fail-closed (sin la variable, 401 — nunca abierto).
 *
 * QUÉ CORRIGE: SOLO el bloque de identidad del paciente (nombre, DNI, CUIL,
 * sexo, nacimiento, cobertura) — lo que la plataforma completa sola desde la
 * ficha. Nunca el contenido clínico ni el bloque del profesional.
 *
 *   POST { consulta_id | turno_id | documento_ids[], motivo, aplicar?: boolean }
 *
 *   Sin `aplicar: true` es SIMULACIÓN: devuelve qué cambiaría en cada documento
 *   y no escribe nada. Con `aplicar: true` rectifica y devuelve hash anterior,
 *   hash nuevo e instante de firma por documento.
 *
 * Idempotente: un documento cuya identidad ya coincide con la ficha se saltea
 * (`sin_cambios`). Correrlo dos veces no duplica firmas ni logs.
 */

export const maxDuration = 120;

const AUTORIZADO_POR = "Diego González (CEO) — decisión operativa 22/08/2026";
const REFERENCIA = "docs/sprints/2026-08-23-nombre-apellido-y-rectificacion-identidad.md";

function autorizado(req: NextRequest): boolean {
  const secreto = process.env.CRON_SECRET;
  return Boolean(secreto) && req.headers.get("authorization") === `Bearer ${secreto}`;
}

type Body = {
  documento_ids?: unknown;
  consulta_id?: unknown;
  turno_id?: unknown;
  motivo?: unknown;
  aplicar?: unknown;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Los documentos alcanzados: explícitos por id, o todos los firmables y
 *  sellados de una consulta / un turno. */
async function documentosAlcanzados(body: Body): Promise<string[]> {
  if (Array.isArray(body.documento_ids)) {
    return body.documento_ids.filter((x): x is string => typeof x === "string" && UUID.test(x));
  }
  const admin = createAdminClient();
  const columna =
    typeof body.consulta_id === "string" && UUID.test(body.consulta_id)
      ? (["consulta_id", body.consulta_id] as const)
      : typeof body.turno_id === "string" && UUID.test(body.turno_id)
        ? (["turno_id", body.turno_id] as const)
        : null;
  if (!columna) return [];
  const { data, error } = await admin
    .from("documentos")
    .select("id")
    .eq(columna[0], columna[1])
    .in("tipo", [...TIPOS_FIRMABLES])
    .not("firma_digital", "is", null)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`documentos: ${error.message}`);
  return (data ?? []).map((d) => d.id as string);
}

export async function POST(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as Body;
  const motivo = typeof body.motivo === "string" ? body.motivo.trim() : "";
  if (!motivo) {
    return NextResponse.json({ error: "Falta el motivo de la rectificación" }, { status: 400 });
  }
  const aplicar = body.aplicar === true;

  let ids: string[];
  try {
    ids = await documentosAlcanzados(body);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
  if (ids.length === 0) {
    return NextResponse.json({ error: "Sin documentos alcanzados" }, { status: 400 });
  }

  const resultados: Array<Record<string, unknown>> = [];
  for (const id of ids) {
    const e = await evaluarRectificacionIdentidad(id);
    if (!e.apto) {
      resultados.push({ documento_id: id, apto: false, motivo: e.motivo, detalle: e.detalle });
      continue;
    }
    if (!aplicar) {
      resultados.push({ documento_id: id, apto: true, tipo: e.tipo, cambios: e.cambios });
      continue;
    }
    const r = await rectificarIdentidadDocumento(id, {
      motivo,
      autorizadoPor: AUTORIZADO_POR,
      referencia: REFERENCIA,
    });
    resultados.push({ documento_id: id, tipo: e.tipo, ...r });
  }

  return NextResponse.json({
    simulacion: !aplicar,
    motivo,
    documentos: ids.length,
    resultados,
  });
}
