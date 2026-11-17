// Compara dos huellas (scripts/respaldo/huella.mjs). Uso:
//   node scripts/respaldo/comparar.mjs prod.json copia.json
// Sale con código 1 si algo de lo que tiene que coincidir no coincide.
// Imprime solo "igual" / "distinto" (sin conteos): se puede pegar en un doc.
import fs from "fs";

const [a, b] = process.argv.slice(2).map((p) => JSON.parse(fs.readFileSync(p, "utf8")));
let fallas = 0;
const linea = (grupo, k, ok, nota = "") => {
  if (!ok) fallas++;
  console.log(`${ok ? "igual   " : "DISTINTO"}  ${grupo}.${k}${nota ? "  — " + nota : ""}`);
};

for (const k of Object.keys(a.datos)) {
  const x = a.datos[k], y = b.datos[k];
  linea("datos", k, !!y && x.n === y.n && x.h === y.h, y && x.n !== y.n ? `diferencia de ${y.n - x.n} filas` : "");
}
for (const k of Object.keys(a.esquema)) {
  const x = a.esquema[k], y = b.esquema[k] || {};
  if (x.error || y.error) { linea("esquema", k, false, `error: ${x.error || y.error}`); continue; }
  linea("esquema", k, x.h === y.h && x.n === y.n);
}
// Tablas completas: informativo (producción siguió escribiendo después del corte).
const distintas = Object.keys(a.todas).filter((k) => a.todas[k] !== b.todas[k]);
const faltan = Object.keys(a.todas).filter((k) => !(k in b.todas));
console.log(`\ninformativo: ${Object.keys(a.todas).length} tablas; ${faltan.length} faltan en la copia; ${distintas.length} con otra cantidad total (escrituras después del corte)`);
if (faltan.length) { fallas++; console.log("FALTAN:", faltan.join(", ")); }
if (distintas.length) console.log("con otra cantidad:", distintas.join(", "));
console.log(fallas ? `\n${fallas} diferencia(s) en lo que tiene que coincidir` : "\nTodo lo que tiene que coincidir coincide.");
process.exit(fallas ? 1 : 0);
