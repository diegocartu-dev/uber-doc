// Suite de la vista de tabla — PORTADA DESDE OVERCALL junto con src/lib/tabla.ts.
// Corre con el runner del repo: node scripts/test-unit.mjs
import { textoBuscable, compararTexto, ordenar, filtrar, coincide, valoresDe, llevaFiltro,
         siguienteOrden, hayVista, vistaAUrl, urlAVista, VISTA_VACIA, type Columna, type Vista } from "../../src/lib/tabla";

let fallas = 0;
const ok = (nombre: string, cond: boolean, extra?: unknown) => {
  if (cond) console.log(`  ok: ${nombre}`);
  else { fallas++; console.log(`  FALLA: ${nombre}`, extra ?? ""); }
};
const eq = (nombre: string, a: unknown, b: unknown) =>
  ok(nombre, JSON.stringify(a) === JSON.stringify(b), `dio ${JSON.stringify(a)} · esperaba ${JSON.stringify(b)}`);

type F = { id: string; nombre: string; estado: string; dde: string; cll: number | null; creada: string };
const F = (id: string, nombre: string, estado: string, dde: string, cll: number | null, creada: string): F =>
  ({ id, nombre, estado, dde, cll, creada });
const FILAS: F[] = [
  F("1", "Atención directa", "Normal", "7001", 12, "2026-07-22"),
  F("2", "Base 10", "Suspendida", "7002", 3, "2026-09-04"),
  F("3", "Base 2", "Normal", "7010", null, "2026-08-11"),
  F("4", "ñandú", "Suspendida", "7003", 40, "2026-08-11"),
  F("5", "ATENCION nocturna", "Normal", "7004", 7, "2026-05-30"),
];
const COLS: Columna<F>[] = [
  { k: "estado", t: "Estado", val: (f) => f.estado },
  { k: "nombre", t: "Actividad", val: (f) => f.nombre },
  { k: "dde", t: "DDE", val: (f) => f.dde },
  { k: "cll", t: "CLL", val: (f) => f.cll, num: true },
  { k: "creada", t: "Creada", val: (f) => f.creada, tipo: "fecha", porEvento: true },
  { k: "acc", t: "Acciones", val: () => "", sinOrden: true },
];
const nuevoPrimero = (a: F, b: F) => compararTexto(b.creada, a.creada);
const nom = (f: F) => f.nombre;
const V = (p: Partial<Vista> = {}): Vista => ({ ...VISTA_VACIA, filtros: {}, ...p });

console.log("== normalización: el bug de 'Atención' no vuelve ==");
eq("acentos fuera, letra queda", textoBuscable("Atención"), "atencion");
eq("ñ se conserva", textoBuscable("ÑANDÚ"), "nandu");
ok("null no explota", textoBuscable(null) === "");

console.log("\n== orden alfabético como lo espera una persona ==");
eq("Base 2 antes que Base 10, y el acento/mayúscula no cambia el lugar",
   ordenar(FILAS, COLS, { k: "nombre", dir: "asc" }, nuevoPrimero, nom).map((f) => f.nombre),
   ["Atención directa", "ATENCION nocturna", "Base 2", "Base 10", "ñandú"]);
eq("invertido", ordenar(FILAS, COLS, { k: "nombre", dir: "desc" }, nuevoPrimero, nom)[0].nombre, "ñandú");

console.log("\n== orden por defecto: lo más nuevo arriba ==");
eq("sin orden = más nuevo primero", ordenar(FILAS, COLS, null, nuevoPrimero, nom).map((f) => f.creada),
   ["2026-09-04", "2026-08-11", "2026-08-11", "2026-07-22", "2026-05-30"]);
eq("empate por fecha se desempata estable (por nombre)",
   ordenar(FILAS, COLS, null, nuevoPrimero, nom).filter((f) => f.creada === "2026-08-11").map((f) => f.nombre),
   ["Base 2", "ñandú"]);
ok("el desempate no cambia entre corridas: dos ordenadas dan lo mismo",
   JSON.stringify(ordenar(FILAS, COLS, { k: "estado", dir: "asc" }, nuevoPrimero, nom).map(nom)) ===
   JSON.stringify(ordenar([...FILAS].reverse(), COLS, { k: "estado", dir: "asc" }, nuevoPrimero, nom).map(nom)));

console.log("\n== números: los vacíos SIEMPRE al final ==");
eq("asc", ordenar(FILAS, COLS, { k: "cll", dir: "asc" }, nuevoPrimero, nom).map((f) => f.cll), [3, 7, 12, 40, null]);
eq("desc", ordenar(FILAS, COLS, { k: "cll", dir: "desc" }, nuevoPrimero, nom).map((f) => f.cll), [40, 12, 7, 3, null]);
eq("números como números, no como texto (40 último si fuera texto)", ordenar(FILAS, COLS, { k: "cll", dir: "asc" }, nuevoPrimero, nom).map((f) => f.cll), [3, 7, 12, 40, null]);

console.log("\n== fechas ==");
eq("orden por fecha asc", ordenar(FILAS, COLS, { k: "creada", dir: "asc" }, nuevoPrimero, nom)[0].creada, "2026-05-30");

console.log("\n== la columna de acciones no ordena ==");
eq("orden por 'acc' cae al defecto", ordenar(FILAS, COLS, { k: "acc", dir: "asc" }, nuevoPrimero, nom)[0].creada, "2026-09-04");

console.log("\n== buscador ==");
ok("sin acento encuentra con acento", coincide(FILAS[0], COLS, "atencion"));
ok("mayúsculas dan igual", coincide(FILAS[4], COLS, "ATENCION"));
ok("dos palabras = AND", coincide(FILAS[0], COLS, "atencion directa"));
ok("AND de verdad: una palabra que no está descarta", !coincide(FILAS[0], COLS, "atencion nocturna"));
ok("busca también por número", coincide(FILAS[1], COLS, "7002"));
eq("filtra la lista", filtrar(FILAS, COLS, V({ texto: "base" })).map(nom), ["Base 10", "Base 2"]);
eq("vacío no filtra", filtrar(FILAS, COLS, V({ texto: "   " })).length, 5);

console.log("\n== filtro por columna (lo destildado se excluye) ==");
eq("saco Normal", filtrar(FILAS, COLS, V({ filtros: { estado: ["Normal"] } })).map((f) => f.estado), ["Suspendida", "Suspendida"]);
eq("lista vacía = sin filtro", filtrar(FILAS, COLS, V({ filtros: { estado: [] } })).length, 5);
eq("se combina con el buscador", filtrar(FILAS, COLS, V({ texto: "base", filtros: { estado: ["Normal"] } })).map(nom), ["Base 10"]);

console.log("\n== valores del embudo ==");
eq("con su conteo", valoresDe(FILAS, COLS, COLS[0], V()), [{ valor: "Normal", n: 3 }, { valor: "Suspendida", n: 2 }]);
eq("un valor destildado SIGUE en su propia lista (si no, no se puede volver a tildar)",
   valoresDe(FILAS, COLS, COLS[0], V({ filtros: { estado: ["Normal"] } })).map((x) => x.valor), ["Normal", "Suspendida"]);
eq("pero otra columna sí ve el filtro aplicado",
   valoresDe(FILAS, COLS, COLS[1], V({ filtros: { estado: ["Normal"] } })).map((x) => x.valor), ["Base 10", "ñandú"]);

console.log("\n== quién lleva embudo (criterio de Diego, 2026-09-08) ==");
ok("Actividad SÍ: la crea el admin", llevaFiltro(COLS[1]));
ok("DDE SÍ: lo crea el admin", llevaFiltro(COLS[2]));
ok("Creada NO: la genera el evento", !llevaFiltro(COLS[4]));
ok("Acciones NO", !llevaFiltro(COLS[5]));
ok("el default es llevarlo", llevaFiltro({ k: "x", t: "X", val: () => "" }));

console.log("\n== los tres estados del clic ==");
eq("1º", siguienteOrden(null, "nombre"), { k: "nombre", dir: "asc" });
eq("2º", siguienteOrden({ k: "nombre", dir: "asc" }, "nombre"), { k: "nombre", dir: "desc" });
eq("3º vuelve al defecto", siguienteOrden({ k: "nombre", dir: "desc" }, "nombre"), null);
eq("otra columna arranca de cero", siguienteOrden({ k: "nombre", dir: "desc" }, "dde"), { k: "dde", dir: "asc" });

console.log("\n== la vista viaja en la URL ==");
const v1: Vista = { texto: "base salta", orden: { k: "cll", dir: "desc" }, filtros: { estado: ["Normal", "Suspendida"] } };
eq("ida y vuelta", urlAVista(vistaAUrl(v1)), v1);
eq("vista vacía no ensucia la URL", vistaAUrl(V()), "");
ok("hayVista con texto", hayVista(V({ texto: "a" })));
ok("hayVista con filtro", hayVista(V({ filtros: { estado: ["Normal"] } })));
ok("hayVista falso si está limpia", !hayVista(V()));
ok("filtros con lista vacía no cuentan", !hayVista(V({ filtros: { estado: [] } })));
eq("valores con ~ o & sobreviven", urlAVista(vistaAUrl(V({ filtros: { d: ["a&b", "c d"] } }))).filtros.d, ["a&b", "c d"]);

console.log(fallas ? `\n${fallas} FALLA(S)` : "\nTodo OK");
process.exit(fallas ? 1 : 0);
