// Copia del Storage de Supabase a Vercel Blob (privado, São Paulo).
//
// POR QUÉ (16/11/2026): el respaldo diario de la base NO incluye los archivos
// del Storage (credenciales, firmas manuscritas, fotos): solo su metadata. Y
// nuestro propio código borra del Storage en tres lugares (reemplazo de
// credencial, de firma y de estudios). Sin esta copia, un borrado nuestro no
// tiene vuelta atrás. Procedimiento y prueba de restauración:
// docs/infra/2026-11-16-restauracion-probada.md.
//
// Cómo guarda: cada versión de cada archivo es un blob propio,
//   storage/<ref del proyecto>/<bucket>/<ruta del archivo>@<etag>
// El etag es el md5 del contenido que da Supabase, así que un archivo que no
// cambió no se vuelve a copiar, y uno reemplazado deja su versión vieja en la
// copia. Nunca se borra nada de la copia: es el "deshacer" de un borrado nuestro.
// Sin manifiesto ni estado aparte: lo copiado se deduce de listar la copia.

import { createHash } from "crypto";
import { list, put } from "@vercel/blob";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Buckets que no se copian, con su motivo. */
export const BUCKETS_EXCLUIDOS: Record<string, string> = {
  // Estudios que el paciente sube durante la consulta: se borran solos a las
  // 6 h (cron limpieza-estudios-temp). Son temporales por diseño.
  "consultas-temp": "temporal: se borra solo a las 6 h",
};

export interface ArchivoStorage {
  bucket: string;
  ruta: string;
  etag: string;
  tamano: number;
  tipo: string;
  /** Alta del archivo en Storage (para saber si un pendiente se estancó). */
  creado: string | null;
}

/** Orden de copia: lo que da validez legal y lo que no se puede volver a pedir, primero. */
export const PRIORIDAD_BUCKETS = ["firmas-medicos", "credenciales-medicos"];

/** Un pendiente con más de estas horas en Storage hace sonar el cron. */
export const HORAS_PENDIENTE_ESTANCADO = 48;

/** Normaliza el etag de Supabase ("\"abc...\"" o "abc-2") a [a-z0-9-]. */
export function normalizarEtag(etag: string | undefined | null): string {
  return String(etag ?? "").toLowerCase().replace(/[^a-z0-9-]/g, "");
}

export function rutaEnCopia(ref: string, a: Pick<ArchivoStorage, "bucket" | "ruta" | "etag">): string {
  return `storage/${ref}/${a.bucket}/${a.ruta}@${a.etag}`;
}

/** Inversa de rutaEnCopia. null si el pathname no es de este proyecto. */
export function leerRutaEnCopia(
  ref: string,
  pathname: string,
): { bucket: string; ruta: string; etag: string } | null {
  const prefijo = `storage/${ref}/`;
  if (!pathname.startsWith(prefijo)) return null;
  const resto = pathname.slice(prefijo.length);
  const barra = resto.indexOf("/");
  const arroba = resto.lastIndexOf("@");
  if (barra <= 0 || arroba <= barra + 1) return null;
  return { bucket: resto.slice(0, barra), ruta: resto.slice(barra + 1, arroba), etag: resto.slice(arroba + 1) };
}

/** El ref del proyecto sale de la URL de Supabase (https://<ref>.supabase.co). */
export function refDelProyecto(url: string | undefined): string {
  const m = /^https:\/\/([a-z0-9]+)\.supabase\.co/.exec(url ?? "");
  if (!m) throw new Error("No pude leer el ref del proyecto de NEXT_PUBLIC_SUPABASE_URL");
  return m[1];
}

/** Lista recursiva de todos los archivos de un bucket. */
async function listarBucket(admin: SupabaseClient, bucket: string, carpeta = ""): Promise<ArchivoStorage[]> {
  const salida: ArchivoStorage[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await admin.storage.from(bucket).list(carpeta, {
      limit: 1000,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) throw new Error(`listar ${bucket}: ${error.message}`);
    for (const item of data ?? []) {
      const ruta = carpeta ? `${carpeta}/${item.name}` : item.name;
      if (item.id === null) {
        salida.push(...(await listarBucket(admin, bucket, ruta)));
      } else {
        const meta = (item.metadata ?? {}) as Record<string, unknown>;
        salida.push({
          bucket,
          ruta,
          etag: normalizarEtag(meta.eTag as string),
          tamano: Number(meta.size ?? 0),
          tipo: String(meta.mimetype ?? "application/octet-stream"),
          creado: item.created_at ?? null,
        });
      }
    }
    if ((data ?? []).length < 1000) break;
  }
  return salida;
}

export async function listarStorage(admin: SupabaseClient): Promise<ArchivoStorage[]> {
  const { data: buckets, error } = await admin.storage.listBuckets();
  if (error) throw new Error(`listar buckets: ${error.message}`);
  const salida: ArchivoStorage[] = [];
  for (const b of buckets ?? []) {
    if (b.id in BUCKETS_EXCLUIDOS) continue;
    salida.push(...(await listarBucket(admin, b.id)));
  }
  return salida;
}

/** Todos los pathnames de la copia de este proyecto. */
export async function listarCopia(ref: string, token?: string): Promise<Map<string, { url: string; size: number; uploadedAt: Date }>> {
  const salida = new Map<string, { url: string; size: number; uploadedAt: Date }>();
  let cursor: string | undefined;
  do {
    const r = await list({ prefix: `storage/${ref}/`, limit: 1000, cursor, token });
    for (const b of r.blobs) salida.set(b.pathname, { url: b.url, size: b.size, uploadedAt: b.uploadedAt });
    cursor = r.hasMore ? r.cursor : undefined;
  } while (cursor);
  return salida;
}

export interface ResultadoCopia {
  ref: string;
  archivos: number;
  yaCopiados: number;
  copiadosAhora: number;
  bytesAhora: number;
  /** No alcanzó el tiempo, o el contenido cambió mientras se copiaba: va en la próxima. */
  pendientes: number;
  /** Pendientes con más de HORAS_PENDIENTE_ESTANCADO en Storage: la copia no da abasto. */
  estancados: number;
  /** Se borraron entre el listado y la descarga: no es una falla. */
  desaparecidos: number;
  /** Errores que no se resolvieron con reintentos. Solo bucket y motivo (sin rutas: llevan uids). */
  fallas: { bucket: string; error: string }[];
  segundos: number;
}

async function conReintento<T>(fn: () => Promise<T>, intentos = 3): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i >= intentos || (e as Error).name === "NoEncontrado") throw e;
      await new Promise((r) => setTimeout(r, 1500 * i));
    }
  }
}

/** ¿El contenido bajado es el que dice el etag? (en subidas simples el etag es el md5). */
export function contenidoCoincide(buf: Buffer, a: Pick<ArchivoStorage, "etag" | "tamano">): boolean {
  if (a.etag && !a.etag.includes("-")) return createHash("md5").update(buf).digest("hex") === a.etag;
  return buf.length === a.tamano;
}

export function ordenarPorPrioridad(archivos: ArchivoStorage[]): ArchivoStorage[] {
  const peso = (b: string) => {
    const i = PRIORIDAD_BUCKETS.indexOf(b);
    return i === -1 ? PRIORIDAD_BUCKETS.length : i;
  };
  return [...archivos].sort((x, y) => peso(x.bucket) - peso(y.bucket));
}

export function estaEstancado(a: Pick<ArchivoStorage, "creado">, ahora = Date.now()): boolean {
  if (!a.creado) return false;
  return ahora - new Date(a.creado).getTime() > HORAS_PENDIENTE_ESTANCADO * 3600_000;
}

/**
 * Copia a la copia lo que falte. Deja de empezar copias nuevas al pasar
 * `presupuestoMs`; lo que quede se copia en la corrida siguiente (`pendientes`).
 * Antes de guardar, comprueba que lo bajado sea lo que dice el etag: si el
 * archivo cambió en el medio, no se guarda con un etag que no es el suyo.
 */
export async function copiarStorage(
  admin: SupabaseClient,
  ref: string,
  opciones: { presupuestoMs?: number; token?: string } = {},
): Promise<ResultadoCopia> {
  const inicio = Date.now();
  const presupuesto = opciones.presupuestoMs ?? 200_000;
  const archivos = await listarStorage(admin);
  const copia = await listarCopia(ref, opciones.token);
  const faltan = ordenarPorPrioridad(archivos.filter((a) => !copia.has(rutaEnCopia(ref, a))));
  const res: ResultadoCopia = {
    ref,
    archivos: archivos.length,
    yaCopiados: archivos.length - faltan.length,
    copiadosAhora: 0,
    bytesAhora: 0,
    pendientes: 0,
    estancados: 0,
    desaparecidos: 0,
    fallas: [],
    segundos: 0,
  };
  const pendiente = (a: ArchivoStorage) => {
    res.pendientes++;
    if (estaEstancado(a)) res.estancados++;
  };
  const cola = [...faltan];
  const copiarUno = async (a: ArchivoStorage) => {
    if (Date.now() - inicio > presupuesto) return pendiente(a);
    try {
      if (!a.etag) throw new Error("sin etag");
      const buf = await conReintento(async () => {
        const { data, error } = await admin.storage.from(a.bucket).download(a.ruta);
        if (error || !data) {
          const e = new Error(error?.message ?? "descarga vacía");
          if (/not.?found|404/i.test(String(error?.message ?? "") + String((error as { status?: number } | null)?.status ?? ""))) e.name = "NoEncontrado";
          throw e;
        }
        return Buffer.from(await data.arrayBuffer());
      });
      if (!contenidoCoincide(buf, a)) return pendiente(a);
      await put(rutaEnCopia(ref, a), buf, {
        access: "private",
        contentType: a.tipo,
        addRandomSuffix: false,
        allowOverwrite: true,
        token: opciones.token,
      });
      res.copiadosAhora++;
      res.bytesAhora += buf.length;
    } catch (e) {
      if ((e as Error).name === "NoEncontrado") res.desaparecidos++;
      else res.fallas.push({ bucket: a.bucket, error: (e as Error).message.slice(0, 200) });
    }
  };
  // 4 a la vez: rápido sin castigar a la base de producción.
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      for (let a = cola.shift(); a; a = cola.shift()) await copiarUno(a);
    }),
  );
  res.segundos = Math.round((Date.now() - inicio) / 1000);
  return res;
}

/** Suena (500) si algo falló o si la copia no da abasto. Lo pendiente reciente, no. */
export function debeSonar(r: ResultadoCopia): string | null {
  if (r.fallas.length > 0) return `${r.fallas.length} archivo(s) sin copiar por error`;
  if (r.estancados > 0) return `${r.estancados} archivo(s) llevan más de ${HORAS_PENDIENTE_ESTANCADO} h sin copia`;
  if (r.pendientes > 0 && r.copiadosAhora === 0) return `${r.pendientes} pendiente(s) y no se pudo copiar ninguno`;
  return null;
}
