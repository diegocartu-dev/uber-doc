// Tests del ENLACE DE UNA DEMO FUNCIONAL — no vence, y se puede volver a mostrar.
// Runner: node:test + node:assert con tsx (`npm run test:unit`).
//
// ── LA HISTORIA, PORQUE EXPLICA LAS DOS REGLAS ───────────────────────────────
// El enlace de la demo tuvo dos relojes, y los dos arruinaron la preparación en
// el mismo día (17/08/2026): vencía a las 12 h de emitido, y la reunión entera
// se autoborraba 24 h después de creada. Se anclaron al día de la reunión… y a
// las horas Diego encontró el problema real, que era más de fondo:
//
//   "Escaneá el QR y viví. No entiendo por qué regenerar y todo eso.
//    Es simple: el invitado existe o no."
//
// Tenía razón. La complejidad no venía del vencimiento sino de que la base
// guardaba solo el HASH del token: el enlace existía un instante, recargar la
// pantalla lo perdía, y la única salida era "Regenerar" — que echaba a quien ya
// había entrado. De ahí el botón rojo y un diálogo de seis renglones
// explicándole a un usuario el modelo de tokens.
//
// Las dos reglas que quedan, y que este archivo cuida:
//   1. El enlace de demo NO VENCE. Muere cuando se elimina la demo.
//   2. El token en claro se guarda SOLO en demo, para poder redibujar el QR.
//      Para un paciente real sigue guardándose únicamente el hash.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { vencimientoDemo } from "@/lib/institucional/accesos";

// ── 1. No vence ──────────────────────────────────────────────────────────────

test("el enlace de una demo no vence: su vencimiento está a décadas de distancia", () => {
  const ahora = new Date(2026, 7, 18, 22, 0, 0).getTime();
  const vence = new Date(vencimientoDemo(ahora)).getTime();

  const veinteAnios = 20 * 365 * 24 * 3600_000;
  assert.ok(
    vence - ahora > veinteAnios,
    "volvió a haber un reloj: el QR tiene que seguir vivo mientras exista la demo"
  );
});

test("el vencimiento es una fecha válida, no un Infinity ni un Invalid Date", () => {
  // `expira_at` es NOT NULL y `validarTokenAcceso` la compara siempre: una fecha
  // rota acá se convierte en un acceso que no abre y en un error incomprensible
  // en pantalla.
  const v = new Date(vencimientoDemo(new Date(2026, 7, 18).getTime()));
  assert.ok(Number.isFinite(v.getTime()), "el vencimiento tiene que ser una fecha real");
  assert.match(v.toISOString(), /^\d{4}-\d{2}-\d{2}T/, "tiene que serializar como ISO");
});

test("dos enlaces emitidos con meses de diferencia siguen los dos vivos", () => {
  // El caso que rompía: preparar hoy una demo que ocurre dentro de semanas.
  const enero = new Date(2026, 0, 5, 9, 0, 0).getTime();
  const agosto = new Date(2026, 7, 18, 22, 0, 0).getTime();

  for (const [nombre, emitido] of [["enero", enero], ["agosto", agosto]] as const) {
    const vence = new Date(vencimientoDemo(emitido)).getTime();
    assert.ok(
      vence > new Date(2030, 0, 1).getTime(),
      `el enlace emitido en ${nombre} tendría que seguir vivo en 2030`
    );
  }
});

// ── 2. El token en claro, SOLO en demo ───────────────────────────────────────
//
// Esto no se puede probar llamando a la función (toca la base), pero sí se puede
// fijar que la garantía siga siendo ESTRUCTURAL y no una promesa del código: la
// base tiene que rechazar un token en claro en una fila que no sea de demo.

const migracion = readFileSync(
  join(process.cwd(), "supabase/migrations-institucional/029_demo_token_recuperable.sql"),
  "utf8"
);

test("la base impide guardar el token en claro de un acceso que no sea de demo", () => {
  assert.match(
    migracion,
    /CHECK\s*\(\s*token_demo IS NULL OR es_demo = true\s*\)/i,
    "se cayó el CHECK: sin él, guardar el token en claro de un paciente real pasa a " +
      "depender de que el código se acuerde, y el día que se olvide nadie lo va a ver"
  );
});

test("el token en claro no se le grantea a nadie por la vía pública", () => {
  assert.match(
    migracion,
    /REVOKE SELECT \(token_demo\) ON accesos_link FROM anon, authenticated/i,
    "el token en claro quedó legible por el cliente RLS: se lee con service role " +
      "desde el panel, que ya está detrás del guard de admin"
  );
});

test("el código guarda el token en claro solo cuando la fila es de demo", () => {
  const accesos = readFileSync(
    join(process.cwd(), "src/lib/institucional/accesos.ts"),
    "utf8"
  );
  assert.match(
    accesos,
    /token_demo:\s*params\.esDemo\s*\?\s*token\s*:\s*null/,
    "el insert dejó de condicionar `token_demo` a `esDemo`: la base lo va a rechazar " +
      "para pacientes reales, pero el error aparecería recién al emitir un enlace real"
  );
});
