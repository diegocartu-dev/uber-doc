// NOVA SABE QUÉ TIENE OCUPADO, Y POR ESO DEJA DE CHOCARSE.
// Runner: node:test + node:assert con tsx (`npm run test:unit`).
//
// ── QUÉ VERIFICA, Y CONTRA QUÉ ───────────────────────────────────────────────
// Los tres pedidos del enunciado, contra `crearAgendaModelo` DE VERDAD (no una
// imitación de su lógica): la banda libre, la banda ocupada, y el combinado
// —"lunes a viernes de 9 a 12 y también de 15 a 18"—, que es el pedido más
// natural del mundo y fallaba en las DOS configuraciones del escenario, porque
// siempre se pisa con la mitad del día que el escenario llenó.
//
// Para poder correr la función real sin una base se le pasa un cliente de
// mentira (el `supabase` de `crearAgendaModelo` es un parámetro) y se intercepta
// el `fetch` que usa el cliente de service role de adentro. Es más trabajo que
// reescribir la lógica en el test, y es la única forma de que este archivo diga
// algo: un test que reimplementa la regla que quiere probar pasa siempre.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  fusionarBandas,
  recortarFranjas,
  huecosDelDia,
  describirOcupadas,
  resumirDias,
  frasePedidoTodoOcupado,
  bandasOcupadasDelProfesional,
  type BandaOcupada,
  type Franja,
} from "@/lib/institucional/agenda-ocupada";
import { crearAgendaModelo } from "@/lib/agenda/crear-agenda";

// ─────────────────────────────────────────────────────────────────────────────
// La parte pura
// ─────────────────────────────────────────────────────────────────────────────

test("los slots sueltos se cuentan como UNA banda, no como veinte líneas", () => {
  // Un lunes con 9 turnos de 20' de 09:00 a 12:00 es "lunes 09:00-12:00".
  const filas = [];
  for (let m = 9 * 60; m < 12 * 60; m += 20) {
    const h = (x: number) => `${String(Math.floor(x / 60)).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}`;
    filas.push({ fecha: "2026-08-17", hora_inicio: h(m), hora_fin: h(m + 20), canal_origen: "acordado" });
  }
  const bandas = fusionarBandas(filas);
  assert.equal(bandas.length, 1);
  assert.deepEqual(bandas[0], {
    dia_semana: 1,
    hora_inicio: "09:00",
    hora_fin: "12:00",
    canal: "acordado",
  });
});

test("dos bandas separadas del mismo día no se funden", () => {
  const bandas = fusionarBandas([
    { fecha: "2026-08-17", hora_inicio: "09:00", hora_fin: "12:00", canal_origen: "acordado" },
    { fecha: "2026-08-17", hora_inicio: "15:00", hora_fin: "18:00", canal_origen: "acordado" },
  ]);
  assert.equal(bandas.length, 2);
});

test("el resumen que ve Nova agrupa los días iguales", () => {
  const filas = ["2026-08-17", "2026-08-18", "2026-08-19", "2026-08-20", "2026-08-21"].map((fecha) => ({
    fecha,
    hora_inicio: "09:00",
    hora_fin: "12:00",
    canal_origen: "acordado",
  }));
  const texto = describirOcupadas(fusionarBandas(filas));
  assert.equal(texto, "lunes a viernes de 09:00 a 12:00 (turnos que levantó la institución)");
  assert.equal(resumirDias([1, 4]), "lunes y jueves");
  assert.equal(describirOcupadas([]), "Ninguna: tiene la agenda libre.");
});

test("un resto más corto que la duración del turno NO se propone", () => {
  // Crear una agenda que genera cero turnos es peor que no crearla: la API la
  // rechaza con otro mensaje y en la reunión se lee como otro fallo.
  const ocupadas: BandaOcupada[] = [
    { dia_semana: 1, hora_inicio: "09:10", hora_fin: "12:00", canal: "acordado" },
  ];
  const pedida: Franja[] = [{ dia_semana: 1, hora_inicio: "09:00", hora_fin: "12:00" }];
  assert.deepEqual(recortarFranjas(pedida, ocupadas, 20).libres, []);
  assert.equal(recortarFranjas(pedida, ocupadas, 10).libres.length, 1);
});

// ─────────────────────────────────────────────────────────────────────────────
// El arnés: `crearAgendaModelo` real, sin base
// ─────────────────────────────────────────────────────────────────────────────

type Fila = Record<string, unknown>;

const CONFIG_INSTITUCION = {
  id: 1,
  nombre: "Institución de prueba",
  subnombre: null,
  logo_path: null,
  color_primary: "#1D9E75",
  color_primary_dark: "#166F53",
  color_primary_soft: "#E8F5F0",
  dominio: "instancia.invalid",
  pdf_accent: null,
  pdf_isologo_path: null,
  pdf_efector_texto: "Efector de prueba",
  wa_remitente_nombre: null,
  mail_from: "no-reply@instancia.invalid",
  telefono_ayuda: null,
  ci_ventana_inicio: "08:00:00",
  ci_ventana_fin: "20:00:00",
  slot_duracion_min: 20,
  especialidades: ["Clínica médica"],
  vigencia_documentos_dias: 30,
  reenvio_cooldown_minutos: 10,
  reenvio_max_por_dia: 5,
  ventana_entrada_min: 10,
  wa_plantillas: null,
  acuerdo_horas_semana_default: 10,
  precio_consulta_centavos: 0,
  updated_at: "2026-08-13T00:00:00Z",
};

const MEDICO_ID = "11111111-1111-1111-1111-111111111111";

/** Base en memoria: lo único que `crearAgendaModelo` lee y escribe. */
class BaseFalsa {
  turnos: Fila[] = [];
  modelos: Fila[] = [];
  franjas: Fila[] = [];
  private seq = 0;
  id(): string {
    this.seq += 1;
    return `id-${this.seq}`;
  }
  tabla(nombre: string): Fila[] {
    if (nombre === "turnos") return this.turnos;
    if (nombre === "agenda_modelos") return this.modelos;
    if (nombre === "agenda_franjas") return this.franjas;
    throw new Error(`El arnés no conoce la tabla "${nombre}"`);
  }
}

type Filtro = { op: string; col: string; val: unknown };

/** Un query builder de PostgREST con lo justo: filtros, insert, update. */
class QueryFalsa {
  private filtros: Filtro[] = [];
  private unico = false;
  constructor(
    private base: BaseFalsa,
    private nombre: string,
    private modo: "select" | "insert" | "update",
    private payload?: Fila | Fila[]
  ) {}

  select() {
    return this;
  }
  eq(col: string, val: unknown) {
    this.filtros.push({ op: "eq", col, val });
    return this;
  }
  neq(col: string, val: unknown) {
    this.filtros.push({ op: "neq", col, val });
    return this;
  }
  gte(col: string, val: unknown) {
    this.filtros.push({ op: "gte", col, val });
    return this;
  }
  lte(col: string, val: unknown) {
    this.filtros.push({ op: "lte", col, val });
    return this;
  }
  in(col: string, val: unknown[]) {
    this.filtros.push({ op: "in", col, val });
    return this;
  }
  single() {
    this.unico = true;
    return this;
  }
  maybeSingle() {
    this.unico = true;
    return this;
  }

  private matchea(fila: Fila): boolean {
    return this.filtros.every((f) => {
      const v = fila[f.col];
      if (f.op === "eq") return v === f.val;
      if (f.op === "neq") return v !== f.val;
      if (f.op === "gte") return String(v) >= String(f.val);
      if (f.op === "lte") return String(v) <= String(f.val);
      if (f.op === "in") return (f.val as unknown[]).includes(v);
      return true;
    });
  }

  private resolver(): { data: unknown; error: null } {
    const filas = this.base.tabla(this.nombre);
    if (this.modo === "insert") {
      const nuevas = (Array.isArray(this.payload) ? this.payload : [this.payload!]).map((f) => ({
        ...f,
        id: this.base.id(),
      }));
      filas.push(...nuevas);
      return { data: this.unico ? nuevas[0] : nuevas, error: null };
    }
    const seleccionadas = filas.filter((f) => this.matchea(f));
    if (this.modo === "update") {
      for (const f of seleccionadas) Object.assign(f, this.payload as Fila);
      return { data: seleccionadas, error: null };
    }
    return { data: this.unico ? seleccionadas[0] ?? null : seleccionadas, error: null };
  }

  then<T>(ok: (v: { data: unknown; error: null }) => T) {
    return Promise.resolve(this.resolver()).then(ok);
  }
}

function clienteFalso(base: BaseFalsa) {
  return {
    from(nombre: string) {
      return {
        select: () => new QueryFalsa(base, nombre, "select"),
        insert: (payload: Fila | Fila[]) => new QueryFalsa(base, nombre, "insert", payload),
        update: (payload: Fila) => new QueryFalsa(base, nombre, "update", payload),
      };
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

/**
 * El `fetch` que ve el cliente de service role de adentro de
 * `crearAgendaModelo`: config de la institución, la ficha del profesional (de
 * demostración, o sea exenta del gate de firma) y sus claves.
 */
const fetchDeInstancia: typeof globalThis.fetch = async (entrada) => {
  const url = String(entrada instanceof Request ? entrada.url : entrada);
  const objeto = String(
    (entrada instanceof Request ? entrada.headers.get("accept") : null) ?? ""
  ).includes("pgrst.object");

  let cuerpo: unknown = null;
  if (url.includes("/institucion_config")) cuerpo = CONFIG_INSTITUCION;
  else if (url.includes("/medicos")) {
    cuerpo = { id: MEDICO_ID, firma_manuscrita_url: null, demo_sesion_id: "sesion-de-prueba" };
  } else if (url.includes("/medico_claves")) cuerpo = null;
  else if (url.includes("/turnos")) cuerpo = TURNOS_PARA_FETCH;

  const payload = objeto ? cuerpo : cuerpo === null ? [] : Array.isArray(cuerpo) ? cuerpo : [cuerpo];
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

/** Lo que el `fetch` de arriba devuelve al pedir `turnos` (se setea por test). */
let TURNOS_PARA_FETCH: Fila[] = [];

async function conInstancia<T>(fn: () => Promise<T>): Promise<T> {
  const previos = {
    inst: process.env.INSTITUCIONAL,
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY,
    fetch: globalThis.fetch,
  };
  process.env.INSTITUCIONAL = "true";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://instancia.invalid";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-de-mentira";
  globalThis.fetch = fetchDeInstancia;
  try {
    return await fn();
  } finally {
    if (previos.inst === undefined) delete process.env.INSTITUCIONAL;
    else process.env.INSTITUCIONAL = previos.inst;
    if (previos.url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previos.url;
    if (previos.key === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previos.key;
    globalThis.fetch = previos.fetch;
  }
}

const DURACION = CONFIG_INSTITUCION.slot_duracion_min;
const hh = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Rango de dos semanas desde hoy: el test no puede depender del día en que corre. */
function rango(): { desde: string; hasta: string; fechas: string[] } {
  const hoy = new Date();
  hoy.setHours(12, 0, 0, 0);
  const fechas: string[] = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date(hoy);
    d.setDate(d.getDate() + i);
    fechas.push(iso(d));
  }
  return { desde: fechas[0], hasta: fechas[fechas.length - 1], fechas };
}

/** El escenario de la reunión: lunes a viernes de 09:00 a 12:00, canal acordado. */
function escenarioMananaOcupada(base: BaseFalsa): Fila[] {
  const { fechas } = rango();
  const turnos: Fila[] = [];
  for (const fecha of fechas) {
    const dia = new Date(fecha + "T12:00:00").getDay();
    if (dia === 0 || dia === 6) continue;
    for (let m = 9 * 60; m + DURACION <= 12 * 60; m += DURACION) {
      turnos.push({
        id: `escenario-${fecha}-${m}`,
        medico_id: MEDICO_ID,
        modelo_id: "modelo-escenario",
        fecha,
        hora_inicio: hh(m),
        hora_fin: hh(m + DURACION),
        estado: "disponible",
        monto: 0,
        canal_origen: "acordado",
      });
    }
  }
  base.turnos.push(...turnos);
  return turnos;
}

function pedido(horaInicio: string, horaFin: string): Franja[] {
  return [1, 2, 3, 4, 5].map((dia_semana) => ({ dia_semana, hora_inicio: horaInicio, hora_fin: horaFin }));
}

async function crear(base: BaseFalsa, franjas: Franja[]) {
  const { desde, hasta } = rango();
  return crearAgendaModelo(clienteFalso(base), {
    medicoId: MEDICO_ID,
    nombre: "Agenda de prueba",
    fecha_inicio: desde,
    fecha_fin: hasta,
    duracion_turno: DURACION,
    precio: 0,
    franjas,
    canal_origen: "acordado",
  });
}

// ─── Pedido 1: la banda LIBRE ────────────────────────────────────────────────

test("pedido 1 — la banda libre (15 a 18) se crea contra crearAgendaModelo real", async () => {
  await conInstancia(async () => {
    const base = new BaseFalsa();
    escenarioMananaOcupada(base);
    const res = await crear(base, pedido("15:00", "18:00"));
    assert.equal(res.ok, true, res.ok ? "" : `no creó nada: ${res.mensaje}`);
    if (res.ok) assert.ok(res.turnosCreados > 0, "creó el modelo pero cero turnos");
  });
});

// ─── Pedido 2: la banda OCUPADA ──────────────────────────────────────────────

test("pedido 2 — la banda ocupada (9 a 12) la rechaza la API, y Nova ofrece el hueco", async () => {
  await conInstancia(async () => {
    const base = new BaseFalsa();
    const turnos = escenarioMananaOcupada(base);

    // Así se comporta la API, y está bien: nadie atiende dos cosas a la vez.
    const res = await crear(base, pedido("09:00", "12:00"));
    assert.equal(res.ok, false);
    if (!res.ok) assert.equal(res.motivo, "conflicto_agenda");

    // Lo que cambia es que ahora hay una respuesta ÚTIL antes de llegar ahí.
    const ocupadas = fusionarBandas(
      turnos as { fecha: string; hora_inicio: string; hora_fin: string; canal_origen: string }[]
    );
    const recorte = recortarFranjas(pedido("09:00", "12:00"), ocupadas, DURACION);
    assert.deepEqual(recorte.libres, [], "el pedido entero se pisaba: no queda nada que crear");
    assert.ok(recorte.choques.length > 0);

    const huecos = huecosDelDia(ocupadas, 1, { inicio: "08:00", fin: "20:00" }, DURACION);
    assert.deepEqual(huecos, [
      { hora_inicio: "08:00", hora_fin: "09:00" },
      { hora_inicio: "12:00", hora_fin: "20:00" },
    ]);
    const frase = frasePedidoTodoOcupado(recorte.choques, huecos);
    assert.match(frase, /de 09:00 a 12:00 ya tiene turnos que levantó la institución/);
    // Ofrece la tarde entera, no la hora suelta que queda antes de las 9.
    assert.match(frase, /Le puedo abrir de 12:00 a 20:00/);
  });
});

// ─── Pedido 3: el combinado, que fallaba en las DOS configuraciones ──────────

test("pedido 3 — 'de 9 a 12 y también de 15 a 18' deja de fallar entero", async () => {
  await conInstancia(async () => {
    const base = new BaseFalsa();
    const turnos = escenarioMananaOcupada(base);
    const combinado = [...pedido("09:00", "12:00"), ...pedido("15:00", "18:00")];

    // ANTES: la API rechazaba el pedido completo y no se creaba ni la mitad que
    // estaba libre. Este assert documenta ese comportamiento, que no cambia.
    const crudo = await crear(base, combinado);
    assert.equal(crudo.ok, false);
    if (!crudo.ok) assert.equal(crudo.motivo, "conflicto_agenda");

    // AHORA: se recorta contra lo ocupado y se crea la parte libre.
    const ocupadas = fusionarBandas(
      turnos as { fecha: string; hora_inicio: string; hora_fin: string; canal_origen: string }[]
    );
    const recorte = recortarFranjas(combinado, ocupadas, DURACION);
    assert.equal(recorte.libres.length, 5, "tenía que quedar la tarde de los cinco días");
    for (const f of recorte.libres) {
      assert.equal(f.hora_inicio, "15:00");
      assert.equal(f.hora_fin, "18:00");
    }

    const res = await crear(base, recorte.libres);
    assert.equal(res.ok, true, res.ok ? "" : `el recorte tampoco entró: ${res.mensaje}`);
    if (res.ok) assert.ok(res.turnosCreados > 0);
  });
});

test("con la TARDE ocupada, el mismo pedido combinado también entra", async () => {
  // La otra configuración del escenario. El bug fallaba en las dos, así que el
  // test no puede probar solo una.
  await conInstancia(async () => {
    const base = new BaseFalsa();
    const { fechas } = rango();
    const turnos: Fila[] = [];
    for (const fecha of fechas) {
      const dia = new Date(fecha + "T12:00:00").getDay();
      if (dia === 0 || dia === 6) continue;
      for (let m = 15 * 60; m + DURACION <= 18 * 60; m += DURACION) {
        turnos.push({
          id: `tarde-${fecha}-${m}`,
          medico_id: MEDICO_ID,
          modelo_id: "modelo-escenario",
          fecha,
          hora_inicio: hh(m),
          hora_fin: hh(m + DURACION),
          estado: "disponible",
          monto: 0,
          canal_origen: "acordado",
        });
      }
    }
    base.turnos.push(...turnos);

    const combinado = [...pedido("09:00", "12:00"), ...pedido("15:00", "18:00")];
    const ocupadas = fusionarBandas(
      turnos as { fecha: string; hora_inicio: string; hora_fin: string; canal_origen: string }[]
    );
    const recorte = recortarFranjas(combinado, ocupadas, DURACION);
    assert.equal(recorte.libres.length, 5);
    for (const f of recorte.libres) assert.equal(f.hora_inicio, "09:00");

    const res = await crear(base, recorte.libres);
    assert.equal(res.ok, true, res.ok ? "" : `el recorte no entró: ${res.mensaje}`);
  });
});

// ─── Que las dos mitades del fix estén realmente enchufadas ─────────────────

test("Nova recibe las franjas ocupadas en su contexto, y la regla de qué hacer", () => {
  const chat = readFileSync(resolve(process.cwd(), "src/app/api/nova/chat/route.ts"), "utf8");
  assert.match(
    chat,
    /Franjas ya ocupadas: \$\{ocupadoResumen\}/,
    "el contexto de Nova dejó de decirle qué tiene ocupado el profesional: vuelve a armar el " +
      "pedido a ciegas y la API se lo rechaza en vivo"
  );
  assert.match(
    chat,
    /LO QUE YA TIENE PUESTO/,
    "se cayó la regla que le dice a Nova qué hacer cuando el pedido se pisa"
  );
  // El resumen es POR MÉDICO: tiene que ir en el bloque dinámico, no en el
  // estático cacheado, o rompe el cache-hit del prefijo para todos.
  const iEstatico = chat.indexOf("const systemStatic");
  const iDinamico = chat.indexOf("const systemDynamic");
  const iResumen = chat.indexOf("Franjas ya ocupadas: ${ocupadoResumen}");
  assert.ok(iEstatico > 0 && iDinamico > iEstatico && iResumen > iDinamico,
    "el resumen de franjas ocupadas se metió en el bloque cacheado: cambia por médico y por día");
});

test("el confirmador recorta el pedido antes de mandarlo, y solo en la instancia", () => {
  const confirmar = readFileSync(resolve(process.cwd(), "src/app/api/nova/confirmar/route.ts"), "utf8");
  const i = confirmar.indexOf("recortarFranjas");
  assert.ok(i > 0, "el confirmador dejó de recortar el pedido contra lo que ya está ocupado");
  // Gate por modo: en B2C el médico del marketplace sigue recibiendo el rechazo
  // duro de siempre, que es lo que su pantalla espera.
  const iGate = confirmar.lastIndexOf("if (esInstitucional()) {", i);
  assert.ok(iGate > 0 && iGate < i, "el recorte dejó de estar gateado por modo: toca el B2C");
  // Y el recorte tiene que ocurrir ANTES del chequeo de idempotencia, que
  // compara franjas: si no, compara las pedidas y crea las recortadas.
  const iIdempotencia = confirmar.indexOf("nuevaFirma");
  assert.ok(iIdempotencia > i, "el recorte quedó después del chequeo de idempotencia");
});

// ─── La lectura contra la base ───────────────────────────────────────────────

test("la lectura de bandas ocupadas devuelve lo que Nova necesita, y [] en B2C", async () => {
  const { fechas } = rango();
  TURNOS_PARA_FETCH = [
    { fecha: fechas[0], hora_inicio: "09:00", hora_fin: "09:20", canal_origen: "acordado" },
    { fecha: fechas[0], hora_inicio: "09:20", hora_fin: "09:40", canal_origen: "acordado" },
  ];
  const bandas = await conInstancia(() =>
    bandasOcupadasDelProfesional({ medicoId: MEDICO_ID, desde: fechas[0], hasta: fechas[13] })
  );
  assert.equal(bandas.length, 1, "los dos slots contiguos tenían que fundirse en una banda");
  assert.equal(bandas[0].hora_inicio, "09:00");
  assert.equal(bandas[0].hora_fin, "09:40");

  // B2C: no toca la base y no cambia nada del comportamiento de Nova.
  const previo = process.env.INSTITUCIONAL;
  delete process.env.INSTITUCIONAL;
  try {
    const vacio = await bandasOcupadasDelProfesional({
      medicoId: MEDICO_ID,
      desde: fechas[0],
      hasta: fechas[13],
    });
    assert.deepEqual(vacio, []);
  } finally {
    if (previo !== undefined) process.env.INSTITUCIONAL = previo;
  }
});
