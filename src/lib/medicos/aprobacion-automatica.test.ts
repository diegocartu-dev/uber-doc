// La aprobación automática: qué ficha se aprueba sola, con qué condiciones se
// escribe y qué queda para una persona. Datos sintéticos.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ACCION_APROBAR,
  ACCIONES_QUE_FRENAN,
  APROBADO_POR_SISTEMA,
  aprobarPendientesEnVerde,
  aprobarSiCorresponde,
  decidirAprobacionAutomatica,
  type FichaAprobacion,
} from "./aprobacion-automatica";

const EN_VERDE: FichaAprobacion = {
  estado_registro: "pendiente_revision",
  es_cuenta_test: false,
  dado_de_baja: false,
  profesion: "medico",
  identidad_validada: true,
  didit_status: "Approved",
  refeps_validado: true,
};

// ─── La regla ────────────────────────────────────────────────────────────────

test("REFEPS y biometría en verde, sin decisiones previas: se aprueba sola", () => {
  assert.deepEqual(decidirAprobacionAutomatica(EN_VERDE, []), { aprobar: true });
  // Una cuenta de prueba marcada con null es una cuenta real.
  assert.deepEqual(decidirAprobacionAutomatica({ ...EN_VERDE, es_cuenta_test: null }, []), { aprobar: true });
});

test("lo que no está en verde queda para una persona, con su motivo", () => {
  const motivo = (cambio: Partial<FichaAprobacion>, acciones: string[] = []) => {
    const d = decidirAprobacionAutomatica({ ...EN_VERDE, ...cambio }, acciones);
    return d.aprobar ? "aprobar" : d.motivo;
  };
  assert.equal(motivo({ estado_registro: "aprobado" }), "no_esta_en_revision");
  assert.equal(motivo({ estado_registro: "rechazado" }), "no_esta_en_revision");
  assert.equal(motivo({ estado_registro: "suspendido" }), "no_esta_en_revision");
  assert.equal(motivo({ es_cuenta_test: true }), "cuenta_de_prueba");
  assert.equal(motivo({ dado_de_baja: true }), "se_dio_de_baja");
  assert.equal(motivo({ profesion: "psicologo" }), "otra_profesion");
  assert.equal(motivo({ identidad_validada: false }), "sin_biometria");
  assert.equal(motivo({ identidad_validada: null }), "sin_biometria");
  assert.equal(motivo({ refeps_validado: false }), "sin_refeps");
  assert.equal(motivo({ refeps_validado: null }), "sin_refeps");
});

test("identidad validada pero Didit ya no dice Approved: no se aprueba sola", () => {
  for (const estado of ["Declined", "In Review", "Expired", null]) {
    const d = decidirAprobacionAutomatica({ ...EN_VERDE, didit_status: estado }, []);
    assert.deepEqual(d, { aprobar: false, motivo: "sin_biometria" });
  }
});

test("si el equipo la rechazó o la suspendió alguna vez, se aprueba a mano", () => {
  for (const accion of ACCIONES_QUE_FRENAN) {
    assert.deepEqual(decidirAprobacionAutomatica(EN_VERDE, [accion]), { aprobar: false, motivo: "decision_previa_del_equipo" });
    assert.deepEqual(decidirAprobacionAutomatica(EN_VERDE, [ACCION_APROBAR, accion, "reactivar_medico"]), {
      aprobar: false,
      motivo: "decision_previa_del_equipo",
    });
  }
  // Haber estado aprobado antes (volvió a revisión por un cambio de matrícula) no frena.
  assert.deepEqual(decidirAprobacionAutomatica(EN_VERDE, [ACCION_APROBAR]), { aprobar: true });
});

test("las acciones son las mismas palabras que escribe el panel", () => {
  const fuente = readFileSync(join(process.cwd(), "src/lib/admin-audit.ts"), "utf8");
  for (const accion of [ACCION_APROBAR, ...ACCIONES_QUE_FRENAN]) {
    assert.ok(fuente.includes(`"${accion}"`), `admin-audit.ts ya no escribe "${accion}"`);
  }
});

// ─── La escritura ────────────────────────────────────────────────────────────

type Fila = Record<string, unknown>;
interface Llamada { tabla: string; op: "select" | "update" | "insert"; payload?: Fila; filtros: Array<[string, string, unknown]> }

/**
 * Base falsa con una ficha y un historial. Aplica los filtros de cada update
 * como PostgREST (`eq` contra null nunca coincide). `antesDeEscribir` simula a
 * alguien que cambia la ficha entre la lectura y la escritura.
 */
function baseFalsa(
  inicial: Fila,
  opciones: { historial?: string[]; fallaHistorial?: boolean; fallaAuditoria?: boolean; antesDeEscribir?: (f: Fila) => void } = {}
) {
  const fila: Fila = { id: "m1", ...inicial };
  const llamadas: Llamada[] = [];
  const cumple = (filtros: Llamada["filtros"]) => filtros.every(([op, col, v]) => op !== "eq" || (v !== null && fila[col] === v));
  const cliente = {
    from(tabla: string) {
      const c: Llamada = { tabla, op: "select", filtros: [] };
      let quiereFilas = false;
      let unaSola = false;
      const b = {
        select() { if (c.op !== "select") quiereFilas = true; return b; },
        update(payload: Fila) { c.op = "update"; c.payload = payload; return b; },
        insert(payload: Fila) { c.op = "insert"; c.payload = payload; return b; },
        eq(col: string, v: unknown) { c.filtros.push(["eq", col, v]); return b; },
        in(col: string, v: unknown) { c.filtros.push(["in", col, v]); return b; },
        order() { return b; },
        limit() { return b; },
        single() { unaSola = true; return b; },
        then(ok: (r: { data: unknown; error: unknown }) => void) {
          llamadas.push(c);
          const r = (data: unknown, error: unknown = null) => Promise.resolve({ data, error }).then(ok);
          if (tabla === "admin_audit_log") {
            if (c.op === "insert") return r(null, opciones.fallaAuditoria ? { message: "falló" } : null);
            if (opciones.fallaHistorial) return r(null, { message: "sin conexión" });
            return r((opciones.historial ?? []).map((accion) => ({ accion })));
          }
          if (c.op === "select") return unaSola ? r({ ...fila }) : r(cumple(c.filtros) ? [{ id: fila.id }] : []);
          if (c.op === "update") {
            opciones.antesDeEscribir?.(fila);
            if (!cumple(c.filtros)) return r(quiereFilas ? [] : null);
            Object.assign(fila, c.payload);
            return r(quiereFilas ? [{ id: fila.id }] : null);
          }
          return r(null);
        },
      };
      return b;
    },
  };
  return { cliente: cliente as unknown as SupabaseClient, fila, llamadas };
}

function conBienvenida() {
  const enviadas: string[] = [];
  return { enviadas, deps: { enviarBienvenida: async (id: string) => { enviadas.push(id); } } };
}

test("aprueba, deja el rastro sin administrador y manda la bienvenida una vez", async () => {
  const { cliente, fila, llamadas } = baseFalsa({ ...EN_VERDE });
  const { enviadas, deps } = conBienvenida();
  const r = await aprobarSiCorresponde(cliente, "m1", deps);
  assert.deepEqual(r, { aprobado: true, bienvenida: true });
  assert.equal(fila.estado_registro, "aprobado");
  assert.equal(fila.verificado, true);
  assert.equal(fila.verificado_por, APROBADO_POR_SISTEMA);
  assert.ok(typeof fila.verificado_at === "string");
  assert.deepEqual(enviadas, ["m1"]);
  const rastro = llamadas.find((l) => l.tabla === "admin_audit_log" && l.op === "insert");
  assert.equal(rastro?.payload?.admin_user_id, null);
  assert.equal(rastro?.payload?.accion, ACCION_APROBAR);
  assert.equal(rastro?.payload?.recurso_id, "m1");
});

test("el update exige que la ficha siga en revisión y en verde", async () => {
  const { cliente, llamadas } = baseFalsa({ ...EN_VERDE });
  await aprobarSiCorresponde(cliente, "m1", conBienvenida().deps);
  const update = llamadas.find((l) => l.tabla === "medicos" && l.op === "update");
  const condiciones = Object.fromEntries((update?.filtros ?? []).map(([, col, v]) => [col, v]));
  assert.deepEqual(condiciones, {
    id: "m1",
    estado_registro: "pendiente_revision",
    profesion: "medico",
    dado_de_baja: false,
    identidad_validada: true,
    didit_status: "Approved",
    refeps_validado: true,
  });
});

test("si alguien la rechaza entre la lectura y la escritura, no se pisa ni se manda nada", async () => {
  const { cliente, fila, llamadas } = baseFalsa({ ...EN_VERDE }, { antesDeEscribir: (f) => { f.estado_registro = "rechazado"; } });
  const { enviadas, deps } = conBienvenida();
  const r = await aprobarSiCorresponde(cliente, "m1", deps);
  assert.deepEqual(r, { aprobado: false, motivo: "la_ficha_cambio" });
  assert.equal(fila.estado_registro, "rechazado");
  assert.equal(enviadas.length, 0);
  assert.equal(llamadas.some((l) => l.tabla === "admin_audit_log" && l.op === "insert"), false);
});

test("con un rechazo o una suspensión en el historial no escribe nada", async () => {
  const { cliente, fila, llamadas } = baseFalsa({ ...EN_VERDE }, { historial: ["suspender_medico"] });
  const { enviadas, deps } = conBienvenida();
  const r = await aprobarSiCorresponde(cliente, "m1", deps);
  assert.deepEqual(r, { aprobado: false, motivo: "decision_previa_del_equipo" });
  assert.equal(fila.estado_registro, "pendiente_revision");
  assert.equal(llamadas.some((l) => l.op === "update"), false);
  assert.equal(enviadas.length, 0);
});

test("si no se puede leer el historial, no se aprueba: no saber no es 'nunca fue rechazada'", async () => {
  const { cliente, fila, llamadas } = baseFalsa({ ...EN_VERDE }, { fallaHistorial: true });
  const r = await aprobarSiCorresponde(cliente, "m1", conBienvenida().deps);
  assert.deepEqual(r, { aprobado: false, motivo: "no_se_pudo_leer" });
  assert.equal(fila.estado_registro, "pendiente_revision");
  assert.equal(llamadas.some((l) => l.op === "update"), false);
});

test("el que ya estuvo aprobado se vuelve a aprobar sin repetir la bienvenida", async () => {
  const { cliente, fila } = baseFalsa({ ...EN_VERDE }, { historial: [ACCION_APROBAR] });
  const { enviadas, deps } = conBienvenida();
  const r = await aprobarSiCorresponde(cliente, "m1", deps);
  assert.deepEqual(r, { aprobado: true, bienvenida: false });
  assert.equal(fila.estado_registro, "aprobado");
  assert.equal(enviadas.length, 0);
});

test("sin biometría no lee el historial ni escribe", async () => {
  const { cliente, llamadas } = baseFalsa({ ...EN_VERDE, identidad_validada: false, didit_status: "In Progress" });
  const r = await aprobarSiCorresponde(cliente, "m1", conBienvenida().deps);
  assert.deepEqual(r, { aprobado: false, motivo: "sin_biometria" });
  assert.deepEqual(llamadas.map((l) => `${l.tabla}:${l.op}`), ["medicos:select"]);
});

test("que falle el rastro o el mail no deshace la aprobación ni lanza", async () => {
  const { cliente, fila } = baseFalsa({ ...EN_VERDE }, { fallaAuditoria: true });
  const r = await aprobarSiCorresponde(cliente, "m1", { enviarBienvenida: async () => { throw new Error("resend caído"); } });
  assert.equal(fila.estado_registro, "aprobado");
  assert.deepEqual(r, { aprobado: true, bienvenida: false });
});

test("en la instancia institucional no hace nada", async () => {
  const previo = process.env.INSTITUCIONAL;
  process.env.INSTITUCIONAL = "true";
  try {
    const { cliente, fila, llamadas } = baseFalsa({ ...EN_VERDE });
    assert.deepEqual(await aprobarSiCorresponde(cliente, "m1", conBienvenida().deps), { aprobado: false, motivo: "instancia_institucional" });
    assert.deepEqual(await aprobarPendientesEnVerde(cliente, conBienvenida().deps), { revisadas: 0, aprobadas: 0 });
    assert.equal(llamadas.length, 0);
    assert.equal(fila.estado_registro, "pendiente_revision");
  } finally {
    if (previo === undefined) delete process.env.INSTITUCIONAL;
    else process.env.INSTITUCIONAL = previo;
  }
});

test("el barrido aprueba la ficha en verde que quedó sin aprobar", async () => {
  const { cliente, fila } = baseFalsa({ ...EN_VERDE });
  const { enviadas, deps } = conBienvenida();
  assert.deepEqual(await aprobarPendientesEnVerde(cliente, deps), { revisadas: 1, aprobadas: 1 });
  assert.equal(fila.estado_registro, "aprobado");
  assert.deepEqual(enviadas, ["m1"]);
  // Segunda pasada: ya no está en la lista.
  assert.deepEqual(await aprobarPendientesEnVerde(cliente, deps), { revisadas: 0, aprobadas: 0 });
  assert.equal(enviadas.length, 1);
});
