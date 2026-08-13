// Qué pantalla ve el paciente institucional en una CONSULTA INMEDIATA.
// Runner: node:test + node:assert con tsx.
//
// El caso que motiva la mitad de estos tests: una CI puede figurar `en_curso`
// SIN que el profesional haya entrado. Confiar en el estado para mandar al
// paciente al video lo deja mirando una pantalla negra, y esa lección ya se
// aprendió cara en el B2C (está escrita en `resolver-vencidas.ts`: el plazo de
// 30 minutos no se ejecutó nunca sobre plata real por filtrar mal por estado).

import { test } from "node:test";
import assert from "node:assert/strict";
import { pantallaDeLaConsulta } from "@/lib/institucional/pantalla-consulta";

const SALA = "https://livekit.example/room/abc";

test("recién asignada: puede entrar ahora", () => {
  assert.equal(
    pantallaDeLaConsulta({ estado: "pagada", salaVideoUrl: null }),
    "ventana"
  );
});

test("ya entró y refrescó: sigue esperando, no vuelve a ver el botón", () => {
  assert.equal(
    pantallaDeLaConsulta({ estado: "pagada", salaVideoUrl: null, yaEntro: true }),
    "espera"
  );
});

test("hay sala abierta: al video, sin importar cuál de los dos estados vivos sea", () => {
  assert.equal(pantallaDeLaConsulta({ estado: "pagada", salaVideoUrl: SALA }), "sala");
  assert.equal(pantallaDeLaConsulta({ estado: "en_curso", salaVideoUrl: SALA }), "sala");
});

test("en_curso SIN sala NO manda al video — el profesional todavía no entró", () => {
  assert.equal(
    pantallaDeLaConsulta({ estado: "en_curso", salaVideoUrl: null, yaEntro: true }),
    "espera"
  );
});

test("terminó: la pantalla de los documentos", () => {
  assert.equal(pantallaDeLaConsulta({ estado: "completada", salaVideoUrl: SALA }), "terminado");
});

test("las ausencias tienen cada una su pantalla, y ninguna dice 'tu consulta terminó'", () => {
  assert.equal(
    pantallaDeLaConsulta({ estado: "medico_ausente", salaVideoUrl: null }),
    "ausente-profesional"
  );
  assert.equal(
    pantallaDeLaConsulta({ estado: "no_show_paciente", salaVideoUrl: null }),
    "ausente-paciente"
  );
});

test("cancelada o rechazada: el enlace no lleva a ningún lado", () => {
  for (const estado of ["cancelada", "rechazada"]) {
    assert.equal(pantallaDeLaConsulta({ estado, salaVideoUrl: null }), "inactivo");
  }
});

test("los estados previos al pago del B2C no existen acá y se tratan como enlace muerto", () => {
  // La CI institucional NACE asignada: si aparece un 'esperando' o un
  // 'aceptada' es un dato de otro mundo, no una pantalla que haya que inventar.
  for (const estado of ["esperando", "aceptada"]) {
    assert.equal(pantallaDeLaConsulta({ estado, salaVideoUrl: null }), "inactivo");
  }
});

test("un estado desconocido es fail-safe, no adivinanza", () => {
  assert.equal(pantallaDeLaConsulta({ estado: "estado_del_futuro", salaVideoUrl: SALA }), "inactivo");
});
