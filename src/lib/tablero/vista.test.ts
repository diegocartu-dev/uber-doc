import { test } from "node:test";
import assert from "node:assert/strict";
import { vista, variacion, varTasa, pasa, indices } from "./vista";
import { COBERTURA, diasCub, perPrev, enPer, diasDelPeriodo } from "./cobertura";
import { FILTROS_VACIOS, type Atencion, type Busqueda, type DatosTablero, type Periodo } from "./tipos";

// Datos sintéticos: ningún nombre ni cifra real (el repo es público).
const HOY = "2026-09-04";
const at = (p: Partial<Atencion>): Atencion => ({
  id: "a", tipo: "ci", fecha: "2026-08-10", semana: "2026-08-10", mes: "2026-08", hora: 10, min: 0, medicoId: "m1", medico: "Prof. Uno", especialidad: "Clínica médica",
  paciente: "p1", canal: "clinica", estado: "completada", nivel: "consulta", desenlace: "atendida", origen: "hito", aceptada: true, pagada: true,
  cobrado: 30000, fee: 1500, reintegrado: 0, reintegroEnCurso: 0, causa: null, causaTexto: null, resueltaPor: null, minAceptar: 2, minEspera: null, minDuracion: null, documentos: [],
  ...p,
});
const bus = (p: Partial<Busqueda>): Busqueda => ({
  fecha: "2026-08-10", semana: "2026-08-10", mes: "2026-08", hora: 9, min: 0, paciente: "p1", provincia: "CABA", medicosProv: 3, ciOnline: 1, agendaTurnos: 0, fotoExacta: true, vistas: 2,
  eligio: true, modo: "ci", medicoElegido: "Prof. Uno", medicoElegidoId: "m1", pidio: true, llegoAlPago: true, pago: true, seAtendio: true, atenciones: ["a"], resultado: "se atendió", matchHabia: true, triage: null, bloqueo: null,
  ...p,
});
const D: DatosTablero = {
  generado: "", hoy: HOY, cobertura: COBERTURA, ocultos: { consultasTest: 0, turnosTest: 0, reservasAbandonadas: 0, reprogramadosOrigen: 0 },
  atenciones: [
    at({ id: "a1" }),
    at({ id: "a2", fecha: "2026-08-20", mes: "2026-08", semana: "2026-08-17", tipo: "turno", medicoId: "m2", medico: "Prof. Dos", paciente: "p2", desenlace: "medico_se_fue", estado: "ausente_medico", cobrado: 0, fee: 0, reintegrado: 40000, causa: "medico_ausente" }),
    at({ id: "a3", fecha: "2026-09-02", mes: "2026-09", semana: "2026-08-31", nivel: "intento", desenlace: "sin_respuesta", estado: "cancelada", aceptada: false, pagada: false, cobrado: 0, fee: 0, origen: "no", paciente: "p3" }),
    at({ id: "a4", fecha: "2026-07-05", mes: "2026-07", semana: "2026-06-29", medicoId: "m2", medico: "Prof. Dos", paciente: "p2", cobrado: 50000, fee: 2500 }),
  ],
  pacientes: [
    { key: "p1", nombre: "Paciente Uno", iniciales: "P. U.", provincia: "CABA", alta: "2026-08-01", altaSemana: "2026-07-27", vioClinica: true, eligio: true, pidio: true, consultas: 1, primeraConsulta: "2026-08-10" },
    { key: "p2", nombre: "Paciente Dos", iniciales: "P. D.", provincia: "Buenos Aires", alta: "2026-07-01", altaSemana: "2026-06-29", vioClinica: true, eligio: true, pidio: true, consultas: 2, primeraConsulta: "2026-07-05" },
    { key: "p3", nombre: "Paciente Tres", iniciales: "P. T.", provincia: null, alta: "2026-09-01", altaSemana: "2026-08-31", vioClinica: true, eligio: false, pidio: true, consultas: 0, primeraConsulta: null },
  ],
  busquedas: [
    bus({}),
    bus({ fecha: "2026-08-11", paciente: "p2", provincia: "Buenos Aires", ciOnline: 0, eligio: false, modo: null, medicoElegido: null, medicoElegidoId: null, pidio: false, llegoAlPago: false, pago: false, seAtendio: false, atenciones: [], resultado: "había médicos pero ninguno en línea", matchHabia: false }),
    bus({ fecha: "2026-09-01", mes: "2026-09", semana: "2026-08-31", paciente: "p3", provincia: null, medicosProv: 0, ciOnline: 0, eligio: false, pidio: false, pago: false, seAtendio: false, atenciones: [], resultado: "sin provincia cargada", matchHabia: true }),
  ],
  slots: [
    { medicoId: "m2", fecha: "2026-08-20", n: 10, libres: 9 },
    { medicoId: "m2", fecha: "2026-09-10", n: 5, libres: 5 },
  ],
  ciHoras: [
    { medicoId: "m1", fecha: "2026-08-10", hora: 9, horas: 1 },
    { medicoId: "m1", fecha: "2026-08-10", hora: 10, horas: 0.5 },
  ],
  medicos: [
    { id: "m1", nombre: "Prof. Uno", especialidad: "Clínica médica", adicionales: [], provincias: ["CABA"], categoria: "founder", estado: "aprobado", baja: false, aprobado: "2026-07-01", registro: "2026-06-20", identidad: true, faltantes: [], mp: "conectado", disponible: true, disponibleDesde: null, disponibleHasta: null, disponibleDesdeAt: null, agendasActivas: 0, agendaPausada: false, slotsFuturos: 0, ultimoOnline: "2026-08-10", ausencias: 0, deuda: 0, precio: 30000, modalidad: "ambas", ocultoClinica: false },
    { id: "m2", nombre: "Prof. Dos", especialidad: "Cardiología", adicionales: [], provincias: ["Buenos Aires"], categoria: null, estado: "aprobado", baja: false, aprobado: "2026-06-15", registro: "2026-06-01", identidad: true, faltantes: [], mp: "conectado", disponible: false, disponibleDesde: null, disponibleHasta: null, disponibleDesdeAt: null, agendasActivas: 1, agendaPausada: false, slotsFuturos: 5, ultimoOnline: null, ausencias: 1, deuda: 0, precio: 40000, modalidad: "programada", ocultoClinica: false },
  ],
  esperando: [], refunds: [], alertas: [], avisos: [], mensajes: [], ausencias: [], deuda: [],
};
const meses = (...ms: string[]): Periodo => ({ modo: "meses", meses: new Set(ms), desde: HOY, hasta: HOY });
const dias = (desde: string, hasta: string): Periodo => ({ modo: "dias", meses: new Set(), desde, hasta });
const sel = (per: Periodo, f = FILTROS_VACIOS, intentos = false) => ({ per, f, intentos });

test("las partes suman el total: consultas = Σ desenlaces, atenciones = consultas + intentos", () => {
  const V = vista(D, sel(meses("2026-07", "2026-08", "2026-09")));
  assert.equal(V.at.length, 4);
  assert.equal(V.consultas.length + V.intentos.length, V.at.length);
  const porDesenlace = ["atendida", "medico_se_fue"].reduce((s, d) => s + V.consultas.filter((a) => a.desenlace === d).length, 0);
  assert.equal(porDesenlace, V.consultas.length);
  assert.equal(V.n, 3); // los intentos no son consultas salvo que se los incluya
  assert.equal(vista(D, sel(meses("2026-07", "2026-08", "2026-09"), FILTROS_VACIOS, true)).n, 4);
});

test("un mes da exactamente el mes, y el rango de días equivalente da lo mismo", () => {
  const ago = vista(D, sel(meses("2026-08")));
  assert.equal(ago.n, 2);
  assert.equal(ago.cobrado, 30000);
  assert.equal(ago.reintegrado, 40000);
  const rango = vista(D, sel(dias("2026-08-01", "2026-08-31")));
  assert.deepEqual([rango.n, rango.cobrado, rango.reintegrado, rango.busN, rango.slotsN, rango.ciHoras], [ago.n, ago.cobrado, ago.reintegrado, ago.busN, ago.slotsN, ago.ciHoras]);
});

test("el rango es la suma de sus días para las métricas aditivas", () => {
  const per = dias("2026-08-09", "2026-08-21");
  const V = vista(D, sel(per));
  const porDia = diasDelPeriodo(per, HOY).map((f) => vista(D, sel(dias(f, f))));
  for (const k of ["n", "cobrado", "reintegrado", "busN", "busConAlguienN", "slotsN", "ciHoras"] as const) {
    assert.equal(V[k], porDia.reduce((s, v) => s + (v[k] as number), 0), k);
  }
});

test("liquidez y conversión con oferta: el denominador excluye a quien no cargó provincia", () => {
  const V = vista(D, sel(meses("2026-08", "2026-09")));
  assert.equal(V.busN, 3);
  assert.equal(V.busSinProvN, 1);
  assert.equal(V.busConProvN, 2);
  assert.equal(V.busConAlguienN, 1);
  assert.equal(V.busSinNadieN, 1);
  assert.equal(V.liquidez, 50);
  assert.equal(V.convServida, 100);
});

test("la plata: cobrado y devuelto son partición de lo que movió plata; el fee nunca supera el cobrado", () => {
  const V = vista(D, sel(meses("2026-07", "2026-08", "2026-09")));
  assert.equal(V.cobrado, 80000);
  assert.equal(V.reintegrado, 40000);
  assert.equal(V.cobradasN, 2);
  assert.ok(V.fee <= V.cobrado);
});

test("los filtros se acumulan y la ficha del profesional coincide con el ranking por construcción", () => {
  const todo = vista(D, sel(meses("2026-07", "2026-08", "2026-09")));
  const m2 = vista(D, sel(meses("2026-07", "2026-08", "2026-09"), { ...FILTROS_VACIOS, medico: "m2" }));
  assert.equal(m2.consultas.length, todo.consultas.filter((a) => a.medicoId === "m2").length);
  assert.equal(m2.cobrado, 50000);
  const m2adv = vista(D, sel(meses("2026-07", "2026-08", "2026-09"), { ...FILTROS_VACIOS, medico: "m2", des: "medico_se_fue" }));
  assert.equal(m2adv.consultas.length, 1);
  // el filtro por provincia usa la provincia del PACIENTE
  const caba = vista(D, sel(meses("2026-07", "2026-08", "2026-09"), { ...FILTROS_VACIOS, prov: "CABA" }));
  assert.equal(caba.consultas.length, 1);
  assert.equal(caba.pacsN, 1);
  const ix = indices(D);
  assert.equal(pasa(D.atenciones[0], { ...FILTROS_VACIOS, motivo: "Atendida" }, ix), true);
});

test("sin cobertura no hay divisor: un mes anterior al lanzamiento cubre cero días", () => {
  assert.equal(diasCub(meses("2026-05"), COBERTURA.consultas, HOY), 0);
  assert.equal(diasCub(meses("2026-06"), COBERTURA.consultas, HOY), 21); // del 10 al 30 de junio
  assert.equal(diasCub(dias("2026-09-01", "2026-09-30"), COBERTURA.consultas, HOY), 4); // el mes en curso se mide hasta hoy
  assert.equal(vista(D, sel(meses("2026-05"))).liquidez, null);
});

test("el período previo equivalente tiene el mismo largo e inmediatamente antes", () => {
  const prev = perPrev(dias("2026-08-29", "2026-09-04"));
  assert.equal(prev.desde, "2026-08-22");
  assert.equal(prev.hasta, "2026-08-28");
  const prevM = perPrev(meses("2026-08", "2026-09"));
  assert.deepEqual([...prevM.meses].sort(), ["2026-06", "2026-07"]);
  assert.equal(enPer(prev, "2026-08-22"), true);
  assert.equal(enPer(prev, "2026-08-29"), false);
});

test("variación: con base chica no hay porcentaje ni color; con base y ruido, no hay color", () => {
  assert.equal(variacion(2, 7, 1, 7)?.texto, "▲ +1");
  assert.equal(variacion(2, 7, 1, 7)?.cls, "flat");
  assert.equal(variacion(0, 1, 0, 1), null);
  assert.equal(variacion(1, 7, 0, 0), null);
  // 17 vs 12 sobre el mismo largo: diferencia 5 < 2·√29 ≈ 10,8 → dentro del ruido
  assert.equal(variacion(17, 30, 12, 30)?.cls, "flat");
  // 40 vs 12: diferencia 28 > 2·√52 ≈ 14,4 → sube
  assert.equal(variacion(40, 30, 12, 30)?.cls, "up");
  // plata: la base la dan las consultas cobradas, no los pesos
  assert.equal(variacion(300000, 30, 100000, 30, { plata: true, nSel: 3, nPrev: 1 })?.cls, "flat");
  assert.equal(varTasa(1, 3, 0, 1)?.cls, "flat");
  assert.equal(varTasa(20, 40, 8, 40)?.cls, "up");
});
