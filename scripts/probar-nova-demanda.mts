// Verifica contra PRODUCCIÓN el orden de franjas que Nova va a recomendar.
//
//   npx tsx scripts/probar-nova-demanda.mts
//
// Imprime SOLO el orden y verdaderos/falsos — nunca cifras de demanda: el repo
// es público y este output puede terminar pegado en un PR. Y esa es además la
// regla del producto (Diego, 20/09/2026): Nova no da números.
// Sale con código 1 si el helper devolviera un número hacia afuera.

import fs from "node:fs";
import path from "node:path";

for (const archivo of [".env.production.check", ".env.local"]) {
  const ruta = path.resolve(process.cwd(), archivo);
  if (!fs.existsSync(ruta)) continue;
  for (const linea of fs.readFileSync(ruta, "utf8").split("\n")) {
    const i = linea.indexOf("=");
    if (i < 1 || linea.trim().startsWith("#")) continue;
    const k = linea.slice(0, i).trim();
    if (!process.env[k]) process.env[k] = linea.slice(i + 1).trim().replace(/^"(.*)"$/, "$1");
  }
}
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(2);
}

const { franjasPorChance } = await import("../src/lib/nova/demanda");

let fallas = 0;
const ok = (cond: boolean, nombre: string) => {
  console.log(`${cond ? "  ok  " : "FALLA "} ${nombre}`);
  if (!cond) fallas++;
};

const r = await franjasPorChance();
console.log("\nOrden que va a usar Nova:", r ? r.orden.join("  >  ") : "(sin datos — Nova no recomienda nada)");
console.log("La que nombra primero:", r?.mejor ?? "—", "\n");

ok(r !== null, "el helper devuelve un orden con los datos de producción");
ok(!r || r.orden.length === 3, "están las tres franjas");
ok(!r || r.mejor === r.orden[0], "la mejor es la primera del orden");
// Que no se escape una CIFRA de demanda. No alcanza con buscar dígitos: las
// etiquetas llevan la hora ("de 9 a 12"). Lo que se comprueba es que hacia
// afuera no salga NADA que no sea una de las tres etiquetas conocidas.
const PERMITIDAS = ["de 9 a 12", "de 14 a 17", "de 19 a 23"];
ok(!r || r.orden.every((f) => PERMITIDAS.includes(f)),
   "NO se escapa ninguna cifra: solo salen las etiquetas de franja (regla de producto)");

const t0 = Date.now();
await franjasPorChance();
ok(Date.now() - t0 < 50, "la segunda llamada sale del cache y no vuelve a la base");

console.log(fallas ? `\n${fallas} falla(s)` : "\nTodo bien.");
process.exit(fallas ? 1 : 0);
