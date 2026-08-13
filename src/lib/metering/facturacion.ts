// src/lib/metering/facturacion.ts
// LA FACTURA DEL MES: cuántas consultas facturables hubo en un período y
// cuánto suman (spec institucional §6.5). SOLO instancia institucional.
//
// ── POR QUÉ NO SE REUSA NADA DE /insights ────────────────────────────────────
// El tablero del B2C tiene dos módulos que a primera vista servirían y no
// sirven:
//   · `src/lib/insights/plata.ts` gira alrededor de `mp_status`, fees y netos
//     de Mercado Pago. Acá NO hay Mercado Pago: el paciente no paga, la
//     institución factura contra un precio por consulta que vive en el config.
//   · `src/lib/insights/reservas.ts` existe por `reservado_pendiente` y la
//     retención de 15 minutos para pagar — un estado que esta instancia jamás
//     produce, porque no hay checkout que esperar.
// Traer cualquiera de los dos sería arrastrar un modelo de plata que no aplica
// y que en la primera lectura confundiría a quien audite la factura.
//
// Lo que sí es: un count con nombre.

import { createAdminClient } from "@/lib/supabase/admin";
import { getConfigInstitucion } from "@/lib/institucional/config";
import { contarExacto, leerTodo, leerTodoEnLotes } from "@/lib/metering/db";
import { encuentrosSinClasificarEnRango } from "@/lib/metering/bolsa";
import type { Motor } from "@/lib/metering/clasificar";

export interface LineaFacturacion {
  fecha_ar: string;
  tipo: "consulta" | "turno";
  recurso_id: string;
  motor: Motor;
  especialidad: string | null;
  profesional: string;
  segundos_ambos_en_sala: number;
  documentos_emitidos: number;
  precio_centavos: number;
}

export interface Facturacion {
  periodo: string; // "AAAA-MM"
  consultas: number;
  /** Precio VIGENTE hoy. Referencia, no la base del total: cada línea trae el suyo. */
  precio_centavos: number;
  total_centavos: number;
  /**
   * `true` = el total se estimó multiplicando por el precio vigente (modo KPI,
   * que no trae filas). El total que vale, el del CSV, suma el precio congelado
   * de cada línea.
   */
  total_estimado: boolean;
  lineas: LineaFacturacion[];
}

/** ¿"2026-10" es un período válido? El parámetro viene de la URL. */
export function periodoValido(periodo: string): boolean {
  if (!/^\d{4}-\d{2}$/.test(periodo)) return false;
  const mes = Number(periodo.slice(5, 7));
  return mes >= 1 && mes <= 12;
}

/** Primer y último día AR de ese mes, como "AAAA-MM-DD". */
export function rangoDePeriodo(periodo: string): { desde: string; hasta: string } {
  const anio = Number(periodo.slice(0, 4));
  const mes = Number(periodo.slice(5, 7));
  const ultimo = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  return { desde: `${periodo}-01`, hasta: `${periodo}-${String(ultimo).padStart(2, "0")}` };
}

/** "2026-10" → "Octubre" (el título de la card de facturación). */
export function nombreDePeriodo(periodo: string): string {
  const { desde } = rangoDePeriodo(periodo);
  const nombre = new Date(`${desde}T12:00:00Z`).toLocaleDateString("es-AR", {
    month: "long",
    timeZone: "UTC",
  });
  return nombre.charAt(0).toUpperCase() + nombre.slice(1);
}

/** El período AR de hoy ("AAAA-MM"). */
export function periodoDeHoy(ahoraMs = Date.now()): string {
  return new Date(ahoraMs - 3 * 3600_000).toISOString().slice(0, 7);
}

/**
 * El período que le corresponde a la semana que el panel está mostrando: el mes
 * del LUNES. Una semana a caballo de dos meses se factura donde empezó — hace
 * falta una regla y esta es la que se lee sola en el título ("Semana del 26 de
 * octubre al 1 de noviembre — Octubre").
 *
 * Existe porque la card de facturación tenía el mes de HOY clavado: el 1 de
 * noviembre, la administración que entraba a facturar octubre veía "Noviembre —
 * 0 consultas facturables" y un botón que bajaba un CSV vacío.
 */
export function periodoDeSemana(lunesAr: string): string {
  return lunesAr.slice(0, 7);
}

/**
 * Hasta qué día llega el conteo del período que se está mirando: hoy si el mes
 * está en curso, el último día del mes si ya terminó. (Y el primero, si alguien
 * llegó a un mes que todavía no empezó.)
 */
export function corteDePeriodo(periodo: string, hoyAr: string): string {
  const { desde, hasta } = rangoDePeriodo(periodo);
  if (hoyAr < desde) return desde;
  return hoyAr < hasta ? hoyAr : hasta;
}

/** Centavos → "$ 1.234.500" (sin decimales: los precios del contrato son enteros). */
export function pesos(centavos: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(Math.round(centavos / 100));
}

/**
 * De dónde salen las líneas de la factura de un período.
 *
 * ── POR QUÉ NO ES SIEMPRE EL RANGO DE FECHAS ─────────────────────────────────
 * Un mes SELLADO ya se facturó, y `CRONS_META['metering-cerrar-mes']` promete
 * que "el detalle que se le pasa a la institución no cambia nunca más". Si la
 * factura se siguiera armando por rango de `fecha_ar`, cualquier fila que
 * apareciera después del cierre —un encuentro que entró por un webhook muy
 * tardío— se sumaría sola a un mes ya facturado, sin sello, sin auditoría y sin
 * figurar en /admin/periodos (que lista por `facturado_periodo`). Los dos
 * números contractuales, otra vez, divergiendo en silencio.
 *
 * Con el mes sellado, la factura sale del SELLO: es exactamente la foto que se
 * congeló. Un mes en curso —o uno que todavía no se cerró— sale del rango de
 * fechas, que es lo único que hay.
 *
 * Las filas que llegan tarde no se pierden: quedan sin sellar y /admin/periodos
 * las muestra aparte, marcadas, para que las decida un humano.
 */
export type FiltroFacturacion =
  | { modo: "sellado"; periodo: string }
  | { modo: "en_vivo"; desde: string; hasta: string };

export function filtroDeFacturacion(periodo: string, sellado: boolean): FiltroFacturacion {
  if (sellado) return { modo: "sellado", periodo };
  const { desde, hasta } = rangoDePeriodo(periodo);
  return { modo: "en_vivo", desde, hasta };
}

/**
 * Todo lo facturable del período, línea por línea.
 *
 * `detalle: false` (default del KPI) devuelve solo el conteo y el total —
 * el panel muestra un número, no necesita traerse el mes entero.
 *
 * ── CÓMO SE CUENTA, Y POR QUÉ ASÍ ────────────────────────────────────────────
 * El KPI cuenta con `count: 'exact'` en el servidor y el detalle pagina con
 * `.range()` hasta agotar. Antes contaba `filas.length` de un select sin tope:
 * PostgREST corta en 1000 filas sin avisar, así que un mes grande subfacturaba
 * en silencio — y como el CSV y el KPI salen de la misma función, la
 * verificación obvia ("el CSV suma lo mismo que el panel") daba OK con los dos
 * mal. Detalle del hallazgo en `src/lib/metering/db.ts`.
 *
 * TIRA si la base falla: una factura vacía por un timeout se ve exactamente
 * igual que un mes sin actividad, y esa confusión se paga discutiendo con el
 * cliente.
 *
 * ── DE DÓNDE SALEN LAS FILAS ─────────────────────────────────────────────────
 * De `filtroDeFacturacion`: el sello si el mes ya se cerró, el rango de fechas
 * si sigue abierto. El KPI y el CSV usan el mismo filtro, así que no pueden
 * decir cosas distintas sobre el mismo mes.
 */
export async function facturacionDePeriodo(
  periodo: string,
  opciones?: { detalle?: boolean }
): Promise<Facturacion> {
  const admin = createAdminClient();
  const config = await getConfigInstitucion();
  const precio = Number(config.precio_consulta_centavos);
  const filtro = filtroDeFacturacion(periodo, await periodoEstaSellado(periodo));

  if (!opciones?.detalle) {
    const consultas = await contarExacto(`facturación de ${periodo}`, () => {
      const q = admin
        .from("encuentros_metering")
        .select("id", { count: "exact", head: true })
        .eq("clasificacion", "facturable");
      return filtro.modo === "sellado"
        ? q.eq("facturado_periodo", filtro.periodo)
        : q.gte("fecha_ar", filtro.desde).lte("fecha_ar", filtro.hasta);
    });
    return {
      periodo,
      consultas,
      precio_centavos: precio,
      total_centavos: consultas * precio,
      total_estimado: true,
      lineas: [],
    };
  }

  const filas = await leerTodo<Record<string, unknown>>(
    `detalle de facturación de ${periodo}`,
    (dsd, hst) => {
      const q = admin
        .from("encuentros_metering")
        .select(
          "fecha_ar, tipo, recurso_id, motor, especialidad, medico_id, segundos_ambos_en_sala, documentos_emitidos, precio_centavos"
        )
        .eq("clasificacion", "facturable");
      const acotada =
        filtro.modo === "sellado"
          ? q.eq("facturado_periodo", filtro.periodo)
          : q.gte("fecha_ar", filtro.desde).lte("fecha_ar", filtro.hasta);
      return (
        acotada
          // `fecha_ar` sola no es un orden total (hay muchas por día): sin el
          // desempate por `id`, paginar por rango duplicaría filas y saltearía otras.
          .order("fecha_ar", { ascending: true })
          .order("id", { ascending: true })
          .range(dsd, hst)
      );
    }
  );
  const consultas = filas.length;
  // El total sale de los precios CONGELADOS en las filas, nunca del vigente:
  // así el CSV de un mes ya facturado sigue dando el mismo número cuando el
  // precio suba. `precio_centavos` de arriba queda solo como referencia del
  // precio de hoy.
  const base = {
    periodo,
    consultas,
    precio_centavos: precio,
    total_centavos: filas.reduce((s, f) => s + precioDeFila(f, precio), 0),
    total_estimado: false,
  };

  // Nombre del profesional para el detalle: una query, no una por línea.
  const medicoIds = [...new Set(filas.map((f) => f.medico_id as string).filter(Boolean))];
  const nombres = new Map<string, string>();
  const medicos = await leerTodoEnLotes<Record<string, unknown>>(
    "nombres de los profesionales de la factura",
    medicoIds,
    (lote, dsd, hst) =>
      admin
        .from("medicos")
        .select("id, nombre_completo, titulo")
        .in("id", lote)
        .order("id", { ascending: true })
        .range(dsd, hst)
  );
  for (const m of medicos) {
    nombres.set(
      m.id as string,
      `${((m.titulo as string | null) ?? "").trim()} ${((m.nombre_completo as string | null) ?? "").trim()}`.trim()
    );
  }

  return {
    ...base,
    lineas: filas.map((f) => ({
      fecha_ar: f.fecha_ar as string,
      tipo: f.tipo as "consulta" | "turno",
      recurso_id: f.recurso_id as string,
      motor: f.motor as Motor,
      especialidad: (f.especialidad as string | null) ?? null,
      profesional: nombres.get(f.medico_id as string) ?? "",
      segundos_ambos_en_sala: Number(f.segundos_ambos_en_sala ?? 0),
      documentos_emitidos: Number(f.documentos_emitidos ?? 0),
      precio_centavos: precioDeFila(f, precio),
    })),
  };
}

/** Precio congelado de la fila; si por lo que sea no viajó, el vigente. */
function precioDeFila(fila: Record<string, unknown>, vigente: number): number {
  const guardado = Number(fila.precio_centavos);
  return Number.isFinite(guardado) && guardado > 0 ? guardado : vigente;
}

// ─────────────────────────────────────────────────────────────────────────────
// EL CIERRE DEL MES (R31-R32, Diego 13/08)
// ─────────────────────────────────────────────────────────────────────────────
//
// "El mes se cierra solo, el último día a las 24:00." Es una FOTO del mes
// calendario: entra todo lo que ocurrió hasta las 23:59:59 del último día, hora
// argentina; lo posterior es del mes siguiente. Nadie tiene que cerrar nada a
// mano, y la institución no cierra NUNCA: descargar es leer (R32).
//
// El corte de datos es a las 24:00 exactas, pero el sello se estampa unas horas
// después (madrugada del día 1) porque el contador necesita terminar de
// clasificar los últimos encuentros: una consulta que termina 23:55 se clasifica
// pasada la medianoche. La foto siempre es del mes; lo que se demora es el
// revelado.

/** ¿Ese mes ya terminó en hora AR? (pasó el 23:59:59.999 del último día) */
export function mesTerminado(periodo: string, ahoraMs = Date.now()): boolean {
  const { hasta } = rangoDePeriodo(periodo);
  return ahoraMs > Date.parse(`${hasta}T23:59:59.999-03:00`);
}

/** El período que el cron del día 1 tiene que sellar: el mes que terminó. */
export function periodoASellar(ahoraMs = Date.now()): string {
  const hoy = new Date(ahoraMs - 3 * 3600_000);
  // Día 0 del mes AR corriente = último día del mes anterior.
  return new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), 0))
    .toISOString()
    .slice(0, 7);
}

export interface ResumenCierreMes {
  periodo: string;
  /** Facturables del mes al momento del sello (las que la factura cobra). */
  facturables: number;
  /** Cuántas selló ESTA corrida. */
  selladas: number;
  /**
   * Filas del mes con el sello puesto, de TODAS las clasificaciones. Es el
   * universo congelado, y por eso es el número con el que se mide la
   * idempotencia — no `facturables`, que es un subconjunto.
   */
  selladas_total: number;
  /** Ya venían selladas (corrida repetida): la idempotencia, visible. */
  ya_estaban: number;
}

/**
 * Cierra un mes: sella TODAS sus filas (facturables y no facturables — ver
 * `sellarPeriodo`). Es lo que corre el cron del día 1 y lo que se puede volver
 * a correr a mano si ese día falló.
 *
 * ── LAS DOS PRECONDICIONES, Y POR QUÉ ABORTA EN VEZ DE SELLAR ────────────────
 * 1. El mes TERMINÓ. Sellar un mes en curso congelaría medio mes como si fuera
 *    entero, y el sello no se levanta con un botón.
 * 2. El contador terminó de contarlo — la MISMA precondición del cierre semanal
 *    (`encuentrosSinClasificar`), extendida al rango del mes: si queda un
 *    encuentro terminal sin clasificar, o uno TODAVÍA VIVO del último día, no
 *    se sella nada. El caso concreto: la consulta que quedó abierta el 31 a las
 *    22:30 no es terminal en la madrugada del día 1 —`cerrar-huerfanas` corre a
 *    las 00:00 ART y solo cierra las que llevan más de 4 h abiertas—; si se
 *    sellara igual, su fila aparecería después —facturable— sobre un mes ya
 *    congelado.
 *
 * Abortar es más barato que sellar mal: el mes se cierra al día siguiente, en
 * la corrida diaria del cron, mientras que un sello incompleto hay que
 * levantarlo fila por fila con la auditoría de la 021 encima.
 *
 * Idempotente: si vuelve a correr sobre un mes ya sellado, `sellarPeriodo` no
 * toca ninguna fila y el resumen lo dice (`selladas: 0`).
 */
export async function cerrarMes(periodo: string, ahoraMs = Date.now()): Promise<ResumenCierreMes> {
  if (!periodoValido(periodo)) {
    throw new Error(`Período inválido: "${periodo}" (formato AAAA-MM).`);
  }
  if (!mesTerminado(periodo, ahoraMs)) {
    throw new Error(
      `El mes ${periodo} TODAVÍA NO TERMINÓ: no se puede cerrar. El sello es inmutable ` +
        `y la foto es del mes calendario completo (hasta las 23:59:59 del último día, ` +
        `hora argentina). El último mes terminado es ${periodoASellar(ahoraMs)}.`
    );
  }

  const { desde, hasta } = rangoDePeriodo(periodo);
  const faltan = await encuentrosSinClasificarEnRango(desde, hasta);
  if (faltan.total > 0) {
    throw new Error(
      `El mes ${periodo} todavía no se puede cerrar: ${faltan.sin_fila} encuentro(s) terminales ` +
        `sin clasificar y ${faltan.vivos} todavía en curso. Revisá el cron metering-clasificar ` +
        `(y, si hay vivos, esperá a que cierren o a que los cierre cerrar-huerfanas) y volvé a ` +
        `correr el cierre con POST /api/admin/institucional/cerrar-mes.`
    );
  }

  const selladas = await sellarPeriodo(periodo);
  const [selladas_total, facturables] = await Promise.all([
    filasSelladas(periodo),
    facturacionDePeriodo(periodo).then((f) => f.consultas),
  ]);
  return {
    periodo,
    facturables,
    selladas,
    selladas_total,
    // Contra el universo SELLADO, no contra las facturables: comparar contra
    // `facturables` mezclaba dos conjuntos distintos y, con el sello puesto en
    // todas las filas, daba negativo en cuanto el mes tenía una ausencia.
    ya_estaban: Math.max(0, selladas_total - selladas),
  };
}

/**
 * SELLA el período: marca `facturado_periodo` en TODAS las filas del mes que
 * todavía no lo tienen. Devuelve cuántas selló.
 *
 * ── POR QUÉ TODAS Y NO SOLO LAS FACTURABLES ──────────────────────────────────
 * Sellaba solo `clasificacion = 'facturable'`, y ahí el "mes congelado" era
 * media verdad. Las otras filas del mes —`no_facturable_corta`, las dos
 * ausencias, `falla_tecnica`— quedaban con `facturado_periodo` NULL, o sea:
 *
 *   · `motivoIntocable()` devolvía null y el job las seguía reescribiendo
 *     durante los 14 días de su ventana. Y su regla es
 *     `segundos >= 60 || documentos > 0 → facturable`: bastaba que la receta se
 *     guardara tarde (el guardado del profesional es fire-and-forget) o que
 *     llegara un evento de presencia atrasado de LiveKit para que una consulta
 *     del 31 clasificada "corta" pasara a facturable el 3 de noviembre. El CSV
 *     de un mes ya facturado sumaba una consulta, sin sello y sin auditoría.
 *   · y esas mismas filas eran INALCANZABLES por la puerta de R33: la RPC de la
 *     021 aborta si la fila no está sellada, así que la corrección más típica
 *     —"esto se marcó como ausencia y en realidad se atendió"— no se podía
 *     hacer desde /admin/periodos. La puerta corregía en un solo sentido.
 *
 * Sellar el mes entero cierra las dos mitades: lo congelado es el mes, y toda
 * corrección (en cualquier dirección) pasa por la puerta auditada.
 *
 * ── QUÉ SIGUE SIN HACER ──────────────────────────────────────────────────────
 * No cierra el período contra INSERTs: si un encuentro de octubre aparece
 * recién en noviembre (un webhook muy tardío), su fila se inserta sin sello
 * —insertar no está bloqueado, y esconder una atención que ocurrió sería peor
 * que perderla. Esa fila NO entra a la factura ya emitida (ver
 * `facturacionDePeriodo`) y se muestra aparte en /admin/periodos, marcada como
 * llegada después del cierre, para que la decida un humano.
 *
 * Sin esta función, toda la maquinaria de inmutabilidad de la 014 estaba
 * construida y desconectada: NADIE escribía `facturado_periodo`, así que el
 * trigger no llegaba a dispararse nunca y toda fila seguía siendo reescribible
 * por el job cada 10 minutos, indefinidamente.
 *
 * `.is('facturado_periodo', null)` es importante: sin eso el UPDATE tocaría las
 * filas ya selladas y el trigger, correctamente, lo rechazaría entero.
 */
export async function sellarPeriodo(periodo: string): Promise<number> {
  const admin = createAdminClient();
  const { desde, hasta } = rangoDePeriodo(periodo);
  const { count, error } = await admin
    .from("encuentros_metering")
    .update({ facturado_periodo: periodo }, { count: "exact" })
    .gte("fecha_ar", desde)
    .lte("fecha_ar", hasta)
    .is("facturado_periodo", null);
  if (error) throw new Error(`No se pudo sellar el período ${periodo}: ${error.message}`);
  return count ?? 0;
}

/** Cuántas filas quedaron selladas en ese período (todas las clasificaciones). */
export async function filasSelladas(periodo: string): Promise<number> {
  const admin = createAdminClient();
  return contarExacto(`filas selladas de ${periodo}`, () =>
    admin
      .from("encuentros_metering")
      .select("id", { count: "exact", head: true })
      .eq("facturado_periodo", periodo)
  );
}

/** ¿Ese mes ya está sellado? (tiene al menos una fila con el sello puesto) */
export async function periodoEstaSellado(periodo: string): Promise<boolean> {
  return (await filasSelladas(periodo)) > 0;
}

/** Filas de ese mes que todavía no llevan sello. */
export async function filasSinSellar(periodo: string): Promise<number> {
  const admin = createAdminClient();
  const { desde, hasta } = rangoDePeriodo(periodo);
  return contarExacto(`filas sin sellar de ${periodo}`, () =>
    admin
      .from("encuentros_metering")
      .select("id", { count: "exact", head: true })
      .gte("fecha_ar", desde)
      .lte("fecha_ar", hasta)
      .is("facturado_periodo", null)
  );
}

/**
 * Cuántos meses hacia atrás mira el barrido del cierre. 13 cubre un año entero
 * de facturación más el mes en curso: si algo estuvo sin sellar más que eso, el
 * problema ya no es que el cron no llegó.
 */
export const MESES_QUE_MIRA_EL_CIERRE = 13;

/**
 * Los meses ya terminados, del más VIEJO al más nuevo, empezando por el que le
 * toca sellar al cron de hoy. Puro: es la lista de candidatos del barrido.
 */
export function mesesTerminadosHaciaAtras(
  ahoraMs = Date.now(),
  cuantos = MESES_QUE_MIRA_EL_CIERRE
): string[] {
  const ultimo = periodoASellar(ahoraMs);
  const anio = Number(ultimo.slice(0, 4));
  const mes = Number(ultimo.slice(5, 7));
  const out: string[] = [];
  for (let i = cuantos - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(anio, mes - 1 - i, 1));
    out.push(d.toISOString().slice(0, 7));
  }
  return out;
}

/**
 * Meses terminados que quedaron SIN CERRAR — lo que el cron tiene que sellar.
 *
 * ── POR QUÉ NO ALCANZA CON "EL MES ANTERIOR" ─────────────────────────────────
 * El cron cerraba siempre el mes que acababa de terminar y no volvía nunca
 * sobre el que faltó. Si el día 1 fallaba —el job de metering atrasado, una
 * consulta viva del día 31, un deploy en el momento equivocado— la única señal
 * en todo el sistema era UN mail rojo, y si ese mail se perdía el mes quedaba
 * sin sellar de forma indefinida y silenciosa. El watchdog no ayudaba: vigila
 * el latido, y el cron latía.
 *
 * ── POR QUÉ UN MES YA SELLADO NO VUELVE A LA LISTA ───────────────────────────
 * Un mes cerrado puede tener filas sin sello: son las que llegaron DESPUÉS del
 * cierre. Sellarlas ahora las metería a una factura ya emitida por la puerta de
 * atrás, que es justo lo que el sello existe para impedir. Se muestran marcadas
 * en /admin/periodos y las decide un humano.
 */
export async function mesesPendientesDeSellar(
  ahoraMs = Date.now(),
  cuantos = MESES_QUE_MIRA_EL_CIERRE
): Promise<string[]> {
  const pendientes: string[] = [];
  for (const periodo of mesesTerminadosHaciaAtras(ahoraMs, cuantos)) {
    if ((await filasSinSellar(periodo)) === 0) continue;
    if (await periodoEstaSellado(periodo)) continue;
    pendientes.push(periodo);
  }
  return pendientes;
}

/**
 * Escapa un valor para CSV: comillas dobles, comas, `;` y saltos de línea…
 *
 * …y las FÓRMULAS. Un texto que arranca con `=`, `+`, `-` o `@` lo ejecuta
 * Excel al abrir la planilla, y dos columnas de este archivo —profesional y
 * especialidad— salen de la base, o sea de lo que alguien tipeó en un alta. El
 * archivo está pensado explícitamente para el Excel de la administración de un
 * ministerio: un `=HYPERLINK(...)` cargado como nombre se ejecutaría en esa
 * máquina. El apóstrofo adelante lo convierte en texto.
 *
 * Solo se le pone a los strings: los números de este CSV son conteos y precios,
 * y prefijarlos rompería la planilla para nada.
 */
function celda(valor: string | number): string {
  const s = String(valor ?? "");
  const texto = typeof valor === "string" && /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n;]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

/**
 * El CSV de la factura — SERVER-SIDE (spec §6.5).
 *
 * No se arma en el navegador como el export de `/admin/consultas`: ese
 * exporta lo que la pantalla tenía paginado, y una factura que dependa del
 * scroll del que la descargó no es una factura. Acá el archivo se arma con la
 * consulta completa del período.
 *
 * Separador `;` y BOM: es lo que abre bien en el Excel en español que va a
 * usar la administración de la institución.
 */
export function facturacionACSV(f: Facturacion): string {
  const filas = [
    ["fecha", "tipo", "id", "motor", "especialidad", "profesional", "segundos_en_sala", "documentos", "precio"],
    ...f.lineas.map((l) => [
      l.fecha_ar,
      l.tipo === "turno" ? "Turno" : "Consulta inmediata",
      l.recurso_id,
      l.motor,
      l.especialidad ?? "",
      l.profesional,
      l.segundos_ambos_en_sala,
      l.documentos_emitidos,
      (l.precio_centavos / 100).toFixed(2),
    ]),
    [],
    ["TOTAL", "", "", "", "", "", "", f.consultas, (f.total_centavos / 100).toFixed(2)],
  ];
  return "﻿" + filas.map((r) => r.map(celda).join(";")).join("\r\n") + "\r\n";
}
