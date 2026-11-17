// npx tsx --test tests/unit/copia-storage.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizarEtag,
  rutaEnCopia,
  leerRutaEnCopia,
  refDelProyecto,
  BUCKETS_EXCLUIDOS,
} from "../../src/lib/respaldo/copia-storage";

test("el etag de Supabase se normaliza (comillas afuera)", () => {
  assert.equal(normalizarEtag('"D41D8CD98F00B204E9800998ECF8427E"'), "d41d8cd98f00b204e9800998ecf8427e");
  assert.equal(normalizarEtag('"abc123-2"'), "abc123-2");
  assert.equal(normalizarEtag(undefined), "");
});

test("la ruta en la copia va y vuelve, con carpetas y con @ en el nombre", () => {
  const a = { bucket: "firmas-medicos", ruta: "u1/firma@2x.png", etag: "abc" };
  const p = rutaEnCopia("refx", a);
  assert.equal(p, "storage/refx/firmas-medicos/u1/firma@2x.png@abc");
  assert.deepEqual(leerRutaEnCopia("refx", p), a);
});

test("una ruta de otro proyecto no se lee como propia", () => {
  assert.equal(leerRutaEnCopia("refx", "storage/otro/avatars/a.png@e"), null);
  assert.equal(leerRutaEnCopia("refx", "storage/refx/sin-etag"), null);
});

test("el ref sale de la URL de Supabase", () => {
  assert.equal(refDelProyecto("https://abcdefgh.supabase.co"), "abcdefgh");
  assert.throws(() => refDelProyecto("http://localhost:54321"));
});

test("solo se excluye lo temporal por diseño", () => {
  assert.deepEqual(Object.keys(BUCKETS_EXCLUIDOS), ["consultas-temp"]);
});

import { createHash } from "crypto";
import {
  contenidoCoincide,
  ordenarPorPrioridad,
  estaEstancado,
  debeSonar,
  type ArchivoStorage,
  type ResultadoCopia,
} from "../../src/lib/respaldo/copia-storage";

const arch = (bucket: string, extra: Partial<ArchivoStorage> = {}): ArchivoStorage => ({
  bucket, ruta: "u/x.png", etag: "e", tamano: 1, tipo: "image/png", creado: null, ...extra,
});

test("lo bajado se compara con el etag (md5) o, si es multiparte, con el tamaño", () => {
  const buf = Buffer.from("hola");
  const md5 = createHash("md5").update(buf).digest("hex");
  assert.equal(contenidoCoincide(buf, { etag: md5, tamano: 4 }), true);
  assert.equal(contenidoCoincide(buf, { etag: "0".repeat(32), tamano: 4 }), false);
  assert.equal(contenidoCoincide(buf, { etag: "abc-2", tamano: 4 }), true);
  assert.equal(contenidoCoincide(buf, { etag: "abc-2", tamano: 5 }), false);
});

test("firmas y credenciales se copian primero", () => {
  const orden = ordenarPorPrioridad([arch("avatars"), arch("credenciales-medicos"), arch("firmas-medicos")]).map((a) => a.bucket);
  assert.deepEqual(orden, ["firmas-medicos", "credenciales-medicos", "avatars"]);
});

test("un pendiente de más de 48 h está estancado; uno nuevo o sin fecha, no", () => {
  const ahora = Date.parse("2026-11-16T12:00:00Z");
  assert.equal(estaEstancado({ creado: "2026-11-14T11:00:00Z" }, ahora), true);
  assert.equal(estaEstancado({ creado: "2026-11-15T12:00:00Z" }, ahora), false);
  assert.equal(estaEstancado({ creado: null }, ahora), false);
});

test("cuándo suena el cron", () => {
  const base: ResultadoCopia = {
    ref: "r", archivos: 10, yaCopiados: 10, copiadosAhora: 0, bytesAhora: 0,
    pendientes: 0, estancados: 0, desaparecidos: 0, fallas: [], segundos: 1,
  };
  assert.equal(debeSonar(base), null);
  assert.equal(debeSonar({ ...base, desaparecidos: 2 }), null, "un archivo borrado en el medio no es una falla");
  assert.equal(debeSonar({ ...base, pendientes: 3, copiadosAhora: 5 }), null, "lo que no alcanzó va mañana");
  assert.ok(debeSonar({ ...base, pendientes: 3, copiadosAhora: 0 }));
  assert.ok(debeSonar({ ...base, pendientes: 3, copiadosAhora: 5, estancados: 1 }));
  assert.ok(debeSonar({ ...base, fallas: [{ bucket: "avatars", error: "x" }] }));
});
