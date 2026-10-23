// «Qué pasó» (Diego, 23/10/2026): el resumen de un día dice cuántas se
// atendieron, cuántas se cayeron y por qué, con la misma fila que el Historial.
import { test } from "node:test";
import assert from "node:assert/strict";
import { resumirDia, resumirRango, diaDe, type AtencionQuePaso } from "./que-paso";

let n = 0;
const at = (inicio: string, clase: AtencionQuePaso["porque"]["clase"], texto: string, cobrado = 0, extra: Partial<AtencionQuePaso> = {}): AtencionQuePaso => ({
  id: `a${++n}`, tipo: "CI", canal: "ci", estado: clase === "atendida" ? "completada" : "cancelada",
  medico: "M", profesion: null, paciente: "P", inicio, especialidad: "", porque: { clase, texto }, cobrado, ...extra,
});

test("el día es argentino: una CI pedida a las 22:30 ART es de ese día, no del siguiente (UTC)", () => {
  assert.equal(diaDe({ inicio: "2026-10-22T01:30:00Z" }), "2026-10-21");
  assert.equal(diaDe({ inicio: "2026-10-21T10:00:00-03:00" }), "2026-10-21");
});

test("resumen de un día: atendidas, caídas y los motivos contados, lo más nuevo arriba", () => {
  const todas = [
    at("2026-10-21T07:35:00-03:00", "suceso", "El paciente canceló después de que lo aceptaran"),
    at("2026-10-21T15:58:00-03:00", "atendida", "Atendida", 10_000),
    at("2026-10-21T18:00:00-03:00", "falla", "Al profesional le llegó el aviso y no respondió"),
    at("2026-10-21T19:00:00-03:00", "suceso", "El paciente canceló después de que lo aceptaran"),
    at("2026-10-20T12:00:00-03:00", "atendida", "Atendida", 10_000),
    at("2026-10-21T20:00:00-03:00", "en_curso", "En curso", 0, { estado: "en_curso" }),
  ];
  const r = resumirDia("2026-10-21", todas);
  assert.equal(r.total, 5);
  assert.equal(r.atendidas, 1);
  assert.equal(r.enCurso, 1);
  assert.equal(r.caidas, 3);
  assert.equal(r.cobrado, 10_000);
  assert.deepEqual(r.motivos, [
    { texto: "El paciente canceló después de que lo aceptaran", n: 2 },
    { texto: "Al profesional le llegó el aviso y no respondió", n: 1 },
  ]);
  assert.deepEqual(r.atenciones.map((a) => a.inicio.slice(11, 16)), ["20:00", "19:00", "18:00", "15:58", "07:35"]);
});

test("un día sin nada no inventa: cero en todo y sin motivos", () => {
  const r = resumirDia("2026-10-22", [at("2026-10-21T10:00:00-03:00", "atendida", "Atendida")]);
  assert.equal(r.total, 0);
  assert.deepEqual(r.motivos, []);
  assert.equal(r.cobrado, 0);
});

test("el rango es inclusivo en los dos extremos y suma lo cobrado", () => {
  const todas = [
    at("2026-10-17T10:00:00-03:00", "atendida", "Atendida", 10_000),
    at("2026-10-23T10:00:00-03:00", "atendida", "Atendida", 10_000),
    at("2026-10-16T23:00:00-03:00", "atendida", "Atendida", 10_000),
    at("2026-10-24T00:30:00-03:00", "atendida", "Atendida", 10_000),
  ];
  const r = resumirRango("2026-10-17", "2026-10-23", todas);
  assert.equal(r.total, 2);
  assert.equal(r.cobrado, 20_000);
});
