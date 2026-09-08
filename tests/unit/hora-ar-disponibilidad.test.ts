// La ventana de Consulta Inmediata se declara en hora ARGENTINA y tiene que
// evaluarse en hora argentina, corra el código donde corra: en el servidor
// (Vercel = UTC) y en el navegador de un paciente en otra zona horaria.
import assert from "node:assert/strict";
import { test } from "node:test";
import { estaEnHorario, horaActualAR } from "../../src/app/clinica/disponibilidad";

const medica = {
  id: "m", especialidad: "Clínica médica", modalidad_atencion: null, nombre_completo: "X", titulo: null,
  disponible: true, disponible_desde: "09:00:00", disponible_hasta: "12:00:00", disponible_desde_at: null,
  precio_consulta: 20000, duracion_consulta: 30, foto_url: null, habilitadoIdentidad: true,
  ciBloqueadaPorTurno: false, jurisdicciones: ["CABA"],
} as Parameters<typeof estaEnHorario>[0];

test("10:00 AR cae adentro de una ventana 09–12; 12:01 y 08:59 afuera", () => {
  assert.equal(estaEnHorario(medica, "10:00"), true);
  assert.equal(estaEnHorario(medica, "09:17"), true, "el caso real del 01/09");
  assert.equal(estaEnHorario(medica, "12:01"), false);
  assert.equal(estaEnHorario(medica, "08:59"), false);
});

test("horaActualAR convierte un instante UTC a hora argentina (UTC-3), sin depender del TZ del proceso", () => {
  // 12:17 UTC del 01/09/2026 = 09:17 en Buenos Aires.
  assert.equal(horaActualAR(new Date("2026-09-01T12:17:53Z")), "09:17");
  // 02:30 UTC = 23:30 del día anterior en AR.
  assert.equal(horaActualAR(new Date("2026-09-02T02:30:00Z")), "23:30");
});

test("sin ventana declarada manda el toggle; apagado nunca está en horario", () => {
  assert.equal(estaEnHorario({ ...medica, disponible_desde: null, disponible_hasta: null }, "03:00"), true);
  assert.equal(estaEnHorario({ ...medica, disponible: false }, "10:00"), false);
});
