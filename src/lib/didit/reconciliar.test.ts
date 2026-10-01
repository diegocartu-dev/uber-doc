// El cruce de identidad escribe identidad_validada = true en UN solo lugar, y
// solo si la ficha sigue exactamente como se leyó. Estas pruebas corren el cruce
// real (aplicarDecisionAprobada → cerrarCruce) contra una base falsa que aplica
// las condiciones de cada update, para ver QUÉ se escribe y con qué condiciones.
// Todos los datos son sintéticos.

import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { aplicarDecisionAprobada, type ResultadoREFEPS } from "./reconciliar";

type Fila = Record<string, unknown>;
interface Llamada {
  tabla: string;
  op: "select" | "update" | "insert";
  payload?: Fila;
  filtros: Array<[string, string, unknown]>;
}

/** Base falsa de una sola ficha de médico. `antesDeEscribir` simula a alguien que la cambia en el medio. */
function baseFalsa(inicial: Fila, opciones: { antesDeEscribir?: (f: Fila) => void } = {}) {
  const fila: Fila = { ...inicial };
  const llamadas: Llamada[] = [];
  const cumple = (filtros: Llamada["filtros"]) =>
    filtros.every(([op, col, v]) => (op === "is" ? fila[col] === v : op === "in" ? true : fila[col] === v));

  const cliente = {
    from(tabla: string) {
      const c: Llamada = { tabla, op: "select", filtros: [] };
      let quiereFilas = false;
      const b = {
        select() { if (c.op !== "select") quiereFilas = true; return b; },
        update(payload: Fila) { c.op = "update"; c.payload = payload; return b; },
        insert(payload: Fila) { c.op = "insert"; c.payload = payload; return b; },
        eq(col: string, v: unknown) { c.filtros.push(["eq", col, v]); return b; },
        is(col: string, v: unknown) { c.filtros.push(["is", col, v]); return b; },
        in(col: string, v: unknown) { c.filtros.push(["in", col, v]); return b; },
        limit() { return b; },
        single() { return b; },
        then(ok: (r: { data: unknown; error: unknown }) => void) {
          llamadas.push(c);
          if (tabla !== "medicos") return Promise.resolve({ data: [], error: null }).then(ok);
          if (c.op === "select") return Promise.resolve({ data: { ...fila }, error: null }).then(ok);
          if (c.op === "update") {
            if (c.payload && "identidad_validada" in c.payload) opciones.antesDeEscribir?.(fila);
            if (!cumple(c.filtros)) return Promise.resolve({ data: quiereFilas ? [] : null, error: null }).then(ok);
            Object.assign(fila, c.payload);
            return Promise.resolve({ data: quiereFilas ? [{ id: fila.id }] : null, error: null }).then(ok);
          }
          return Promise.resolve({ data: null, error: null }).then(ok);
        },
      };
      return b;
    },
  };
  return { cliente: cliente as unknown as SupabaseClient, fila, llamadas };
}

const DNI = "30111222";
const fichaPendiente = (extra: Fila = {}): Fila => ({
  id: "m1",
  dni: DNI,
  tipo_matricula: "MN",
  numero_matricula: "128456",
  provincia_matricula: null,
  verificado: false,
  verificado_at: null,
  estado_registro: "pendiente_revision",
  slug: "prueba-sintetica-MN128456",
  notas_admin: null,
  identidad_validada: false,
  ...extra,
});
const refeps = (matriculas: Fila[], extra: Partial<ResultadoREFEPS> = {}): ResultadoREFEPS =>
  ({ encontrado: true, activo: true, matriculas, especialidades: [], ...extra }) as unknown as ResultadoREFEPS;
const medico = (f: Fila) => ({ id: f.id as string, dni: f.dni as string, numero_matricula: f.numero_matricula as string, identidad_validada: false, didit_status: "Approved" });
const med = (numero: string, tipo: string) => ({ numero, tipo, habilitada: true, profesion: "Médico" });

test("un dígito mal tipeado: adopta la de REFEPS y valida en el MISMO update, condicionado a la ficha tal como se leyó", async () => {
  const { cliente, fila, llamadas } = baseFalsa(fichaPendiente());
  const r = await aplicarDecisionAprobada(cliente, medico(fila), DNI, { refeps: refeps([med("123456", "CABA")]), alertar: false });
  assert.equal(r.outcome, "validado");
  assert.equal(fila.identidad_validada, true);
  assert.equal(fila.numero_matricula, "123456");
  assert.equal(fila.tipo_matricula, "MN");
  assert.equal(fila.refeps_validado, true);
  assert.deepEqual(fila.jurisdicciones, ["CABA"]);
  assert.match(String(fila.notas_admin), /Matrícula tomada de REFEPS/);
  const valida = llamadas.find((l) => l.op === "update" && l.payload && "identidad_validada" in l.payload);
  const cols = (valida?.filtros ?? []).map(([, c]) => c);
  for (const c of ["id", "identidad_validada", "dni", "tipo_matricula", "numero_matricula", "provincia_matricula", "verificado", "estado_registro", "notas_admin"]) {
    assert.ok(cols.includes(c), `el update que valida no está condicionado a ${c}`);
  }
  // `provincia` (la del consultorio) no se toca.
  assert.ok(!("provincia" in (valida?.payload ?? {})));
  // Quedó en el log de auditoría como acción del sistema.
  assert.ok(llamadas.some((l) => l.tabla === "admin_audit_log" && l.op === "insert" && l.payload?.admin_user_id === null));
});

test("si la ficha cambia mientras se verifica, no se valida nada (y no va a revisión): se reintenta", async () => {
  const { cliente, fila } = baseFalsa(fichaPendiente(), { antesDeEscribir: (f) => { f.numero_matricula = "999999"; } });
  const r = await aplicarDecisionAprobada(cliente, medico(fila), DNI, { refeps: refeps([med("123456", "CABA")]), alertar: false });
  assert.equal(r.outcome, "refeps_transitorio");
  assert.equal(fila.identidad_validada, false);
  assert.equal(fila.didit_status, undefined);
});

test("si lo aprueban mientras se verifica, no se le cambia la matrícula", async () => {
  const { cliente, fila } = baseFalsa(fichaPendiente(), { antesDeEscribir: (f) => { f.verificado = true; f.estado_registro = "aprobado"; } });
  const r = await aplicarDecisionAprobada(cliente, medico(fila), DNI, { refeps: refeps([med("123456", "CABA")]), alertar: false });
  assert.equal(r.outcome, "refeps_transitorio");
  assert.equal(fila.numero_matricula, "128456");
});

test("a un aprobado no se le corrige la matrícula sola: va a revisión, pero se guarda lo que REFEPS dijo", async () => {
  const { cliente, fila } = baseFalsa(fichaPendiente({ verificado: true, estado_registro: "aprobado", refeps_validado: true }));
  const r = await aplicarDecisionAprobada(cliente, medico(fila), DNI, { refeps: refeps([med("123456", "CABA")]), alertar: false });
  assert.equal(r.outcome, "en_revision");
  assert.equal(fila.identidad_validada, false);
  assert.equal(fila.numero_matricula, "128456");
  assert.equal(fila.didit_status, "In Review");
  assert.match(String(fila.identidad_revision_motivo), /ya está aprobado/);
  assert.ok(fila.refeps_data, "el panel necesita las matrículas del DNI verificado para «Usar esta»");
});

test("el DNI de la ficha ya no es el verificado: no se valida", async () => {
  const { cliente, fila } = baseFalsa(fichaPendiente({ dni: "30999888" }));
  const r = await aplicarDecisionAprobada(cliente, { ...medico(fila), dni: DNI }, DNI, { refeps: refeps([med("128456", "CABA")]), alertar: false });
  assert.equal(r.outcome, "refeps_transitorio");
  assert.equal(fila.identidad_validada, false);
});

test("el DNI biométrico no es el de la ficha: revisión por DNI, sin consultar el cruce de matrícula", async () => {
  const { cliente, fila } = baseFalsa(fichaPendiente());
  const r = await aplicarDecisionAprobada(cliente, medico(fila), "30000001", { refeps: refeps([med("128456", "CABA")]), alertar: false });
  assert.equal(r.outcome, "en_revision");
  assert.equal(fila.identidad_validada, false);
  assert.match(String(fila.identidad_revision_motivo), /DNI/);
});

test("REFEPS dice inactivo para el DNI biométrico: el 'no' también se escribe en un no aprobado", async () => {
  const { cliente, fila } = baseFalsa(fichaPendiente({ refeps_validado: true }));
  const r = await aplicarDecisionAprobada(cliente, medico(fila), DNI, { refeps: refeps([med("128456", "CABA")], { activo: false }), alertar: false });
  assert.equal(r.outcome, "validado");
  assert.equal(fila.refeps_validado, false);
});

test("un timeout del Bus no decide nada", async () => {
  const { cliente, fila, llamadas } = baseFalsa(fichaPendiente());
  const r = await aplicarDecisionAprobada(cliente, medico(fila), DNI, { refeps: { encontrado: false, error: "REFEPS_TIMEOUT" } as ResultadoREFEPS, alertar: false });
  assert.equal(r.outcome, "refeps_transitorio");
  assert.equal(llamadas.filter((l) => l.op === "update").length, 0);
});
