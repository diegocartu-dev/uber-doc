// Clasificación de "el paciente ya está adentro de una atención".
//
// El bug que motiva este test: el guard viejo miraba
// ["esperando","aceptada","en_curso"] y se OLVIDABA de "pagada" — justo el
// estado donde hay plata comprometida. Bloqueaba lo que había que dejar pasar y
// dejaba pasar lo que había que bloquear.

import { buscarEncuentroActivo } from "../../src/lib/consultas/encuentro-activo";

type Fila = Record<string, unknown>;

/**
 * Supabase de mentira, encadenable. Devuelve la primera fila de la tabla pedida
 * cuyo `estado` esté dentro del `.in()` que le pasaron.
 */
function fakeSupabase(datos: { consultas?: Fila[]; turnos?: Fila[]; medicos?: Fila[] }) {
  return {
    from(tabla: string) {
      const filas = (datos as Record<string, Fila[] | undefined>)[tabla] ?? [];
      let candidatas = [...filas];
      const api = {
        select: () => api,
        order: () => api,
        limit: () => api,
        eq(col: string, val: unknown) {
          candidatas = candidatas.filter((f) => f[col] === val);
          return api;
        },
        in(col: string, vals: unknown[]) {
          candidatas = candidatas.filter((f) => vals.includes(f[col]));
          return api;
        },
        maybeSingle: async () => ({ data: candidatas[0] ?? null }),
      };
      return api;
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

const USER = "user-1";
const PACIENTE_ROW = "pac-1";
const MEDICOS = [
  { id: "med-A", nombre_completo: "Ana Gómez" },
  { id: "med-B", nombre_completo: "Beto Ruiz" },
];

let passed = 0;
let failed = 0;

async function check(label: string, real: unknown, esperado: unknown) {
  const a = JSON.stringify(real);
  const b = JSON.stringify(esperado);
  if (a === b) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL: ${label}\n  got      ${a}\n  expected ${b}`);
  }
}

async function main() {
  // ── El caso que el guard viejo dejaba pasar ────────────────────────────────
  for (const estado of ["pagada", "en_curso"]) {
    const db = fakeSupabase({
      consultas: [{ id: "c1", medico_id: "med-A", paciente_id: USER, estado }],
      medicos: MEDICOS,
    });
    const r = await buscarEncuentroActivo(db, USER, PACIENTE_ROW);
    await check(`consulta "${estado}" bloquea y viene marcada como paga`,
      { canal: r?.canal, pagado: r?.pagado, id: r?.id }, { canal: "consulta", pagado: true, id: "c1" });
  }

  // ── Los impagos: NO bloquean, se pueden abandonar ──────────────────────────
  for (const estado of ["esperando", "aceptada"]) {
    const db = fakeSupabase({
      consultas: [{ id: "c2", medico_id: "med-A", paciente_id: USER, estado }],
      medicos: MEDICOS,
    });
    const r = await buscarEncuentroActivo(db, USER, PACIENTE_ROW);
    await check(`consulta "${estado}" viene marcada como impaga`,
      { canal: r?.canal, pagado: r?.pagado }, { canal: "consulta", pagado: false });
  }

  // ── Estados terminales: liberan al paciente ────────────────────────────────
  // Es lo que hace que "no asistió" o "se venció el plazo" funcionen sin código
  // extra: el encuentro cambia de estado y deja de figurar acá.
  for (const estado of ["completada", "cancelada", "no_show_paciente", "medico_ausente", "interrumpida"]) {
    const db = fakeSupabase({
      consultas: [{ id: "c3", medico_id: "med-A", paciente_id: USER, estado }],
      medicos: MEDICOS,
    });
    await check(`consulta "${estado}" ya no retiene al paciente`,
      await buscarEncuentroActivo(db, USER, PACIENTE_ROW), null);
  }

  // ── Turnos: solo bloquea el que está EN CURSO ──────────────────────────────
  for (const estado of ["en_espera", "en_curso"]) {
    const db = fakeSupabase({
      turnos: [{ id: "t1", medico_id: "med-B", paciente_id: PACIENTE_ROW, estado }],
      medicos: MEDICOS,
    });
    const r = await buscarEncuentroActivo(db, USER, PACIENTE_ROW);
    await check(`turno "${estado}" bloquea`,
      { canal: r?.canal, pagado: r?.pagado }, { canal: "turno", pagado: true });
  }

  // Un turno agendado para más adelante NO es un viaje en progreso: no puede
  // impedirle al paciente una consulta inmediata hoy.
  for (const estado of ["confirmado", "reservado_pendiente", "disponible", "ausente_paciente"]) {
    const db = fakeSupabase({
      turnos: [{ id: "t2", medico_id: "med-B", paciente_id: PACIENTE_ROW, estado }],
      medicos: MEDICOS,
    });
    await check(`turno "${estado}" NO bloquea una consulta inmediata`,
      await buscarEncuentroActivo(db, USER, PACIENTE_ROW), null);
  }

  // ── Precedencia: lo pagado gana ────────────────────────────────────────────
  {
    const db = fakeSupabase({
      consultas: [
        { id: "impaga", medico_id: "med-A", paciente_id: USER, estado: "esperando" },
        { id: "paga", medico_id: "med-B", paciente_id: USER, estado: "pagada" },
      ],
      medicos: MEDICOS,
    });
    const r = await buscarEncuentroActivo(db, USER, PACIENTE_ROW);
    await check("con una paga y una impaga, manda la paga",
      { id: r?.id, pagado: r?.pagado }, { id: "paga", pagado: true });
  }

  // ── Sin fila de paciente no se miran turnos ────────────────────────────────
  // `consultas.paciente_id` es auth.users.id y `turnos.paciente_id` es
  // pacientes.id: confundirlos devolvería el turno de otra persona.
  {
    const db = fakeSupabase({
      turnos: [{ id: "t3", medico_id: "med-B", paciente_id: PACIENTE_ROW, estado: "en_curso" }],
      medicos: MEDICOS,
    });
    await check("sin pacientes.id no se consultan turnos",
      await buscarEncuentroActivo(db, USER, null), null);
  }

  // ── Nada activo ───────────────────────────────────────────────────────────
  await check("paciente sin atenciones", await buscarEncuentroActivo(fakeSupabase({}), USER, PACIENTE_ROW), null);

  // ── El nombre del profesional llega al cartel ─────────────────────────────
  {
    const db = fakeSupabase({
      consultas: [{ id: "c9", medico_id: "med-A", paciente_id: USER, estado: "pagada" }],
      medicos: MEDICOS,
    });
    const r = await buscarEncuentroActivo(db, USER, PACIENTE_ROW);
    await check("trae el nombre del profesional", r?.medicoNombre, "Ana Gómez");
  }

  // Sin nombre en ficha no se muestra un hueco.
  {
    const db = fakeSupabase({
      consultas: [{ id: "c10", medico_id: "med-Z", paciente_id: USER, estado: "pagada" }],
      medicos: [{ id: "med-Z", nombre_completo: "   " }],
    });
    const r = await buscarEncuentroActivo(db, USER, PACIENTE_ROW);
    await check("sin nombre cae a un texto legible", r?.medicoNombre, "el profesional");
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
