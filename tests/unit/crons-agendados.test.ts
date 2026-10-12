// Ningún cron puede existir en el código sin estar agendado y vigilado.
// Ejecutar:  npx tsx --test tests/unit/crons-agendados.test.ts
//
// POR QUÉ (12/10/2026): el recordatorio de 10 minutos al paciente estuvo escrito
// desde marzo y nunca se agendó en vercel.json. Vercel no lo invocaba, el
// watchdog no lo esperaba y nadie supo que no corría: el aviso que el paciente
// elegía al reservar no le llegó a nadie. Ese mismo día había otros dos crons
// agendados que el watchdog no vigilaba. Una lista que se mantiene "a mano y en
// sincronía" se desincroniza; este test hace que desincronizarla no se pueda
// mergear.
//
// Para cada carpeta de src/app/api/cron/<nombre>/route.ts exige:
//   1. que exporte GET = withCron("<nombre>") — Vercel llama con GET y el latido
//      se escribe con esa clave;
//   2. que esté en vercel.json (si no, Vercel nunca la llama);
//   3. que esté en ESPERADOS con el intervalo que dice su schedule (si no, el
//      watchdog no se entera cuando deja de correr);
//   4. que tenga su ficha en CRONS_META (si no, la alerta llega sin decir qué es).
// Y al revés: nada agendado ni vigilado que no tenga su carpeta.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { ESPERADOS } from "../../src/lib/crons-esperados";
import { CRONS_META } from "../../src/lib/crons-meta";

const raiz = resolve(__dirname, "..", "..");
const dirCron = join(raiz, "src", "app", "api", "cron");

/** Las únicas excepciones, cada una con su motivo. */
const NO_VA_EN_ESPERADOS: Record<string, string> = {
  watchdog: "es el que vigila: no puede esperarse a sí mismo",
};

const carpetas = readdirSync(dirCron).filter((n) => existsSync(join(dirCron, n, "route.ts")));
const agendados = new Map<string, string>(
  (JSON.parse(readFileSync(join(raiz, "vercel.json"), "utf8")).crons as { path: string; schedule: string }[]).map(
    (c) => [c.path.replace(/^\/api\/cron\//, ""), c.schedule]
  )
);

/** Minutos entre corridas según el schedule (solo las formas que usamos). */
function intervaloDelSchedule(schedule: string): number | null {
  const [min, hora, dia, mes, semana] = schedule.trim().split(/\s+/);
  if (dia !== "*" || mes !== "*" || semana !== "*") return null;
  if (min === "*" && hora === "*") return 1;
  const cadaMin = /^\*\/(\d+)$/.exec(min);
  if (cadaMin && hora === "*") return Number(cadaMin[1]);
  if (/^\d+$/.test(min) && hora === "*") return 60;
  const cadaHora = /^\*\/(\d+)$/.exec(hora);
  if (/^\d+$/.test(min) && cadaHora) return Number(cadaHora[1]) * 60;
  if (/^\d+$/.test(min) && /^\d+$/.test(hora)) return 24 * 60;
  return null;
}

test("hay crons para revisar (si esto falla, se movió la carpeta)", () => {
  assert.ok(carpetas.length > 10, `solo encontré ${carpetas.length} crons en ${dirCron}`);
});

for (const nombre of carpetas) {
  test(`cron ${nombre}: registrado, agendado, vigilado y con ficha`, () => {
    const fuente = readFileSync(join(dirCron, nombre, "route.ts"), "utf8");
    // GET y no otro verbo: Vercel invoca los crons con GET. Una ruta que solo
    // exportara POST pasaría un `includes("withCron(")` y respondería 405.
    assert.ok(
      fuente.includes(`export const GET = withCron("${nombre}"`),
      `${nombre}: tiene que exportar GET = withCron("${nombre}", handler) — sin eso Vercel no la llama bien o no escribe su latido`
    );

    const schedule = agendados.get(nombre);
    assert.ok(schedule, `${nombre}: no está en vercel.json → Vercel nunca lo invoca`);

    assert.ok(CRONS_META[nombre], `${nombre}: falta su ficha en src/lib/crons-meta.ts → la alerta no diría qué es`);

    if (NO_VA_EN_ESPERADOS[nombre]) return;
    const esperado = ESPERADOS[nombre];
    assert.ok(esperado, `${nombre}: no está en ESPERADOS (src/lib/crons-esperados.ts) → si deja de correr, nadie se entera`);

    const intervalo = intervaloDelSchedule(schedule!);
    assert.ok(intervalo, `${nombre}: no sé leer el schedule "${schedule}" — sumá el caso al test`);
    assert.equal(
      esperado,
      intervalo,
      `${nombre}: ESPERADOS dice ${esperado} min pero vercel.json lo corre cada ${intervalo} min`
    );
  });
}

test("nada agendado sin carpeta", () => {
  for (const nombre of agendados.keys()) {
    assert.ok(carpetas.includes(nombre), `vercel.json agenda /api/cron/${nombre} y esa ruta no existe`);
  }
});

test("nada vigilado sin carpeta", () => {
  for (const nombre of Object.keys(ESPERADOS)) {
    assert.ok(carpetas.includes(nombre), `ESPERADOS vigila ${nombre} y esa ruta no existe: alertaría por siempre`);
  }
});
