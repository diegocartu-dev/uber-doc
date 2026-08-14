// src/lib/institucional/demo-escenario.ts
// EL ESCENARIO DE LA REUNIÓN — lo que tiene que estar puesto ANTES de que
// empiece. SOLO instancia institucional.
//
// ── QUÉ PROBLEMA RESUELVE ────────────────────────────────────────────────────
// Un profesional recién invitado tiene la agenda vacía. Si el guion arranca ahí,
// las dos primeras escenas son "mirá, no hay nada" — y peor: el otorgador no
// tiene ningún horario que asignar, así que la escena del call center no se
// puede hacer.
//
// Entonces el escenario deja puesto lo que la institución ya habría hecho:
// turnos ACORDADOS desde hoy hasta el 30 de agosto (los levanta la institución,
// R4), con la duración que manda el config (R10), y unos pocos pacientes ya
// sentados en algunos horarios para que la agenda se vea viva.
//
// Ocupa UNA SOLA mitad del día —la mitad en la que ocurre la reunión— y deja la
// otra entera libre. No es estética: es lo que le da a Nova un lugar donde crear
// una agenda sin chocarse con la que ya está. Ver `mitadDelEscenario`.
//
// ── POR QUÉ LOS PACIENTES DE RELLENO SE SIENTAN A MANO Y NO POR EL OTORGADOR ──
// Porque `asignarTurno` escribe una fila en `asignaciones`, y esa tabla es el
// insumo del reparto equitativo: el "X de Y" y el orden de la oferta salen de
// ahí. Sembrar seis pacientes por la vía del otorgador dejaría al profesional
// de la demo con seis asignaciones en la semana, o sea al FINAL de la lista del
// call center — justo antes de que Diego muestre la escena en que el call
// center lo elige. El relleno es escenografía: se pone en `turnos` y no toca
// la contabilidad de nadie.
//
// Todo lo que crea queda colgado de la sesión de demo: se va entero con
// "limpiar reunión".

import { createAdminClient } from "@/lib/supabase/admin";
import { esInstitucional } from "@/lib/instancia";
import { getConfigInstitucion } from "@/lib/institucional/config";
import { crearAgendaModelo, type Franja } from "@/lib/agenda/crear-agenda";
import { dentroVentanaCI } from "@/lib/otorgador/oferta";
import { emailDemo } from "@/lib/institucional/demo";
import { provisionarProfesionalDemo } from "@/lib/institucional/demo-profesional";
import { randomBytes } from "crypto";

// ─── Parte pura (testeable sin DB) ───────────────────────────────────────────

/** Las dos bandas del día de un efector. */
export const FRANJA_MANANA = { hora_inicio: "09:00", hora_fin: "12:00" };
export const FRANJA_TARDE = { hora_inicio: "15:00", hora_fin: "18:00" };

export type MitadDelDia = "mañana" | "tarde";

/**
 * ── LA ESCENA DE NOVA NECESITA UN LUGAR VACÍO ────────────────────────────────
 * El escenario ocupaba las DOS bandas, de lunes a viernes. Y `crearAgendaModelo`
 * rechaza cualquier agenda que se pise con turnos disponibles ya existentes (R1,
 * y está bien: nadie atiende dos cosas a la vez). O sea que cuando el
 * participante le pedía a Nova lo más natural del mundo —"abrime lunes a viernes
 * de 9 a 12"— Nova le contestaba que ya tenía una agenda que se pisa. Delante del
 * ministro, en la escena que se presenta como el salto tecnológico.
 *
 * Desde acá el escenario ocupa UNA SOLA banda y deja la otra entera libre, todos
 * los días del rango. Nova siempre tiene dónde crear.
 *
 * ── POR QUÉ LA BANDA SE ELIGE Y NO ES FIJA ───────────────────────────────────
 * Porque la otra escena que no se puede caer es la del call center asignando "un
 * turno para ahora", y para eso tiene que haber slots CERCA DE LA HORA DE LA
 * REUNIÓN. Con una banda fija, la mitad de las reuniones caía del lado vacío: a
 * las 10 de la mañana con la tarde ocupada no hay un solo turno hoy, y a las 4 de
 * la tarde con la mañana ocupada, tampoco.
 *
 * Entonces se ocupa la mitad del día en la que la reunión efectivamente ocurre, y
 * se reserva la otra. La pantalla dice cuál quedó libre antes de que empiece.
 */
export function mitadDelEscenario(ahora: Date = new Date()): MitadDelDia {
  const ar = new Date(ahora.toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
  return ar.getHours() < 13 ? "mañana" : "tarde";
}

/** La banda que el escenario llena de turnos. */
export function bandaOcupada(mitad: MitadDelDia): { hora_inicio: string; hora_fin: string } {
  return mitad === "mañana" ? FRANJA_MANANA : FRANJA_TARDE;
}

/** La banda que queda LIBRE para que Nova tenga dónde crear. */
export function bandaLibre(mitad: MitadDelDia): { hora_inicio: string; hora_fin: string } {
  return mitad === "mañana" ? FRANJA_TARDE : FRANJA_MANANA;
}

/** ¿Sábado o domingo (hora argentina)? */
export function esFinDeSemana(fechaAr: string): boolean {
  const d = new Date(fechaAr + "T12:00:00").getDay();
  return d === 0 || d === 6;
}

/**
 * Las franjas del escenario: UNA banda, de lunes a viernes.
 *
 * `incluirFinDeSemana` existe porque `armarOferta` solo mira la SEMANA AR
 * CORRIENTE (hoy → domingo): una reunión un sábado tenía como ventana el sábado y
 * el domingo, y con franjas de lunes a viernes eso daba CERO slots. Toda la
 * escena del call center quedaba colgada de la franja improvisada de "ahora".
 */
export function franjasEscenario(
  mitad: MitadDelDia = "mañana",
  incluirFinDeSemana = false
): Franja[] {
  const banda = bandaOcupada(mitad);
  const dias = incluirFinDeSemana ? [1, 2, 3, 4, 5, 6, 7] : [1, 2, 3, 4, 5];
  return dias.map((dia) => ({ dia_semana: dia, ...banda }));
}

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Hoy en hora argentina (la única fecha que vale en este producto). */
export function hoyAR(ahora: Date = new Date()): string {
  return iso(new Date(ahora.toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" })));
}

/**
 * El rango del escenario: HOY hasta el 30 de agosto, que es lo que pide el
 * guion más lo que necesita la pantalla del call center.
 *
 * ── POR QUÉ ARRANCA HOY Y NO EL 20 ───────────────────────────────────────────
 * Arrancaba el 20 de agosto, y con eso la Escena 1 no existía. `armarOferta`
 * solo lee slots de la SEMANA AR CORRIENTE (`hoy` a `domingoDeSemanaAR()`), así
 * que con una reunión el 13 la intersección con el 20-30 era CERO. Y no es que
 * el profesional se viera "sin horarios": `priorizarOferta` descarta la fila
 * entera cuando no hay CI, no hay slots y el acuerdo no está completo — o sea
 * que el participante no figuraba en la lista, y la pantalla del otorgador se
 * proyectaba vacía.
 *
 * Arrancando hoy, el tramo del guion sigue estando (la agenda llega hasta el 30)
 * y además hay oferta esta semana, que es la que el call center puede asignar.
 *
 * Y si esas fechas ya pasaron enteras (la reunión se corrió a septiembre), cae a
 * los próximos diez días: es preferible una demo con turnos que una demo fiel a
 * una fecha que quedó vieja.
 */
export function rangoEscenarioPorDefecto(ahora: Date = new Date()): { desde: string; hasta: string } {
  const hoy = hoyAR(ahora);
  const anio = Number(hoy.slice(0, 4));
  const finAgosto = `${anio}-08-30`;

  if (hoy > finAgosto) {
    const d = new Date(hoy + "T12:00:00");
    const fin = new Date(d);
    fin.setDate(fin.getDate() + 10);
    return { desde: hoy, hasta: iso(fin) };
  }
  return { desde: hoy, hasta: finAgosto };
}

/**
 * La franja de HOY que hace posible la escena del call center.
 *
 * El guion dice "le asigna un turno para ahora": para que eso funcione tiene
 * que haber un slot libre a más de 5 minutos vista (la ventana T−5 del
 * otorgador). Si la reunión cae un martes a las 13:10, entre la franja de la
 * mañana y la de la tarde, no hay ninguno — y la escena que más impresiona se
 * cae por un hueco de agenda.
 *
 * Devuelve `null` si ya no queda tiempo útil en el día.
 */
export function franjaDeAhora(
  ahora: Date = new Date(),
  cierre = "20:00"
): { hora_inicio: string; hora_fin: string } | null {
  const ar = new Date(ahora.toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
  // Arranca en el próximo cuarto de hora: el slot tiene que nacer del lado
  // asignable de la ventana T−5, no encima de ella.
  const minutos = ar.getHours() * 60 + ar.getMinutes() + 10;
  const inicio = Math.ceil(minutos / 15) * 15;
  const [ch, cm] = cierre.split(":").map(Number);
  const finDia = ch * 60 + (cm || 0);
  const fin = Math.min(inicio + 180, finDia);
  if (fin - inicio < 15) return null;
  const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  return { hora_inicio: hhmm(inicio), hora_fin: hhmm(fin) };
}

/** "HH:MM" → minutos desde la medianoche. */
function aMinutos(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
}

function aHHMM(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

/**
 * El primer hueco REAL de la franja de ahora, descontando lo que la agenda
 * principal ya ocupa hoy.
 *
 * ── POR QUÉ HACE FALTA ───────────────────────────────────────────────────────
 * Ahora que el escenario arranca HOY, la agenda principal ya cubre 09:00-12:00 y
 * 15:00-18:00. Una reunión a las 13:10 pedía la franja 13:30-16:30, que se pisa
 * con la de la tarde: `crearAgendaModelo` cortaba por `conflicto_agenda` y NO
 * creaba NADA — ni siquiera el tramo 13:30-15:00, que estaba libre. Y la nota
 * que se le mostraba a Diego decía "Ya había turnos de hoy a esta hora: quedan
 * los que estaban", que es falso: a las 13:30 no había nada, el próximo slot era
 * a las 15:00. Se descubría con el otorgador ya proyectado.
 *
 * Devuelve `null` si no queda ningún tramo de al menos `minimoMin`.
 */
export function huecoDeHoy(
  candidata: { hora_inicio: string; hora_fin: string } | null,
  ocupadas: { hora_inicio: string; hora_fin: string }[],
  minimoMin: number
): { hora_inicio: string; hora_fin: string } | null {
  if (!candidata) return null;
  const orden = [...ocupadas]
    .map((o) => ({ desde: aMinutos(o.hora_inicio), hasta: aMinutos(o.hora_fin) }))
    .sort((a, b) => a.desde - b.desde);

  let cursor = aMinutos(candidata.hora_inicio);
  const fin = aMinutos(candidata.hora_fin);
  for (const o of orden) {
    if (o.hasta <= cursor) continue;
    if (o.desde >= fin) break;
    if (o.desde - cursor >= minimoMin) {
      return { hora_inicio: aHHMM(cursor), hora_fin: aHHMM(Math.min(o.desde, fin)) };
    }
    cursor = Math.max(cursor, o.hasta);
  }
  if (fin - cursor >= minimoMin) return { hora_inicio: aHHMM(cursor), hora_fin: aHHMM(fin) };
  return null;
}

/** Nombres del relleno: obviamente sintéticos, para que nadie los lea como reales. */
export function nombreRelleno(i: number): string {
  return `Paciente de demostración ${i}`;
}

/**
 * El profesional que existe solo para que la reprogramación tenga destino. No es
 * un participante: no lleva datos de ninguna persona y no recibe enlace.
 *
 * ── SE PROYECTA, ASÍ QUE SE LLAMA COMO SE PUEDE LEER ─────────────────────────
 * Se llamaba "Profesional de demostración (respaldo)". Esa fila aparece en la
 * pantalla del call center, al lado del participante y delante de la sala:
 * "(respaldo)" es jerga nuestra —el andamio de la escena— y leerla proyectada es
 * ver el truco. El nombre queda igual de honesto sin el paréntesis, y en línea
 * con los pacientes de utilería ("Paciente de demostración N").
 */
export const NOMBRE_RESPALDO = "Profesional de demostración";

// ─── Preparación real ────────────────────────────────────────────────────────

export interface ResumenEscenario {
  ok: boolean;
  turnosCreados: number;
  turnosOcupados: number;
  pacientesRelleno: number;
  /** Se creó el profesional de respaldo (el destino de la reprogramación). */
  respaldoCreado: boolean;
  /** Lo que quedó puesto, dicho en criollo. Información, no problema. */
  notas: string[];
  /**
   * Lo que va a FALLAR EN VIVO si nadie lo mira. Se pinta en rojo y aparte.
   *
   * Vivía mezclado en `notas`, que la pantalla pinta en verde cuando el
   * escenario sale bien: "la ventana de consulta inmediata está cerrada" —o sea
   * "el toggle disponible no va a encender ningún chip"— se leía como una nota
   * informativa al lado de "agenda lista". Son las dos cosas que hacen que una
   * escena no ocurra.
   */
  alertas: string[];
}

/**
 * Deja la reunión lista para el guion, para UN profesional de la demo.
 *
 * Idempotente en lo que importa: volver a correrlo sobre una agenda que ya
 * existe no duplica turnos (`crearAgendaModelo` frena por choque de horarios) y
 * lo reporta como nota, no como error.
 */
export async function prepararEscenario(params: {
  medicoId: string;
  sesionId: string;
  desde?: string;
  hasta?: string;
  /** Cuántos horarios dejar ya ocupados para que la agenda no se vea vacía. */
  relleno?: number;
}): Promise<ResumenEscenario> {
  const resumen: ResumenEscenario = {
    ok: false,
    turnosCreados: 0,
    turnosOcupados: 0,
    pacientesRelleno: 0,
    respaldoCreado: false,
    notas: [],
    alertas: [],
  };
  if (!esInstitucional()) {
    resumen.notas.push("El modo demo solo existe en la instancia institucional.");
    return resumen;
  }

  const config = await getConfigInstitucion();
  if (config.especialidades.length === 0) {
    resumen.notas.push(
      "La institución no tiene especialidades cargadas: el otorgador no va a poder ofrecer a nadie. Cargalas en Institución."
    );
    return resumen;
  }

  const admin = createAdminClient();

  // ── A QUIÉN LE ESTAMOS LLENANDO LA AGENDA ─────────────────────────────────
  // El `medicoId` viene del cliente (la server action lo pasa tal cual) y este
  // módulo no leía la fila del profesional en ningún momento: `sesionId` solo
  // marcaba los pacientes de relleno. Apuntado a un profesional REAL —un id
  // copiado de otra pestaña del panel, el de una reunión ya cerrada, un request
  // armado a mano— hacía tres cosas irreversibles en su agenda de verdad:
  // le creaba once días de turnos a precio 0, le sentaba pacientes de utilería
  // en sus horarios, y el trigger `trg_turnos_es_demo` estampaba `es_demo` sobre
  // esos slots de forma irreversible por diseño (la marca solo escala) — o sea
  // fuera del contador contractual para siempre. Y después "limpiar reunión" los
  // BORRABA en vez de liberarlos.
  //
  // Es admin-only, pero un botón con pérdida de datos silenciosa no se defiende
  // con que quien lo toca es de confianza. Una query, y se acabó.
  const { data: ficha, error: errFicha } = await admin
    .from("medicos")
    .select("id, demo_sesion_id, especialidad")
    .eq("id", params.medicoId)
    .maybeSingle();
  if (errFicha) {
    resumen.notas.push("No se pudo leer la ficha del profesional. Probá de nuevo.");
    return resumen;
  }
  if (!ficha) {
    resumen.notas.push("Ese profesional no existe.");
    return resumen;
  }
  if (ficha.demo_sesion_id !== params.sesionId) {
    resumen.notas.push(
      "Ese profesional NO es de esta reunión: no se le tocó la agenda. " +
        "Elegí un participante de la lista de arriba."
    );
    return resumen;
  }

  const rango = rangoEscenarioPorDefecto();
  const desde = params.desde || rango.desde;
  const hasta = params.hasta || rango.hasta;

  const hoy = hoyAR();
  // La mitad del día donde ocurre la reunión se llena; la otra queda libre para
  // que Nova tenga dónde crear. Y si la reunión cae un fin de semana, el sábado y
  // el domingo entran a la agenda: son los únicos días que `armarOferta` ve.
  const mitad = mitadDelEscenario();
  const finDeSemana = esFinDeSemana(hoy);
  const libre = bandaLibre(mitad);

  // 1. La agenda del guion: turnos ACORDADOS (los levanta la institución).
  const agenda = await crearAgendaModelo(admin, {
    medicoId: params.medicoId,
    nombre: `Demostración ${desde} a ${hasta}`,
    fecha_inicio: desde,
    fecha_fin: hasta,
    duracion_turno: config.slot_duracion_min,
    precio: 0, // el paciente no paga nunca (R2)
    franjas: franjasEscenario(mitad, finDeSemana),
    canal_origen: "acordado",
  });
  if (agenda.ok) {
    resumen.turnosCreados += agenda.turnosCreados;
  } else {
    resumen.notas.push(
      agenda.motivo === "conflicto_agenda"
        ? "Ese profesional ya tenía agenda en esos días: no se duplicó nada."
        : agenda.mensaje
    );
  }

  // La banda libre se DICE, y se dice primero: es lo que Diego tiene que saber
  // antes de que el participante le hable a Nova.
  resumen.notas.push(
    `Nova tiene libre de ${libre.hora_inicio} a ${libre.hora_fin}, todos los días del rango: ` +
      `pedile ESA franja ("abrime de ${libre.hora_inicio} a ${libre.hora_fin}"). La otra mitad ` +
      `del día ya está llena de turnos y se pisaría.`
  );

  // 2. La franja de HOY, para que el call center pueda asignar "para ahora".
  const diaSemana = new Date(hoy + "T12:00:00").getDay();
  // Las DOS bandas se descuentan, y no solo la que tiene turnos: la ocupada
  // porque el pedido se pisaría con ella y no se crearía nada (ver `huecoDeHoy`),
  // y la libre porque es de Nova — un bloque improvisado ahí adentro volvería a
  // dejarla sin lugar donde crear, que es el bug que esto resuelve.
  const candidata = franjaDeAhora(new Date(), config.ci_ventana_fin.slice(0, 5));
  const ahora = huecoDeHoy(candidata, [FRANJA_MANANA, FRANJA_TARDE], config.slot_duracion_min);

  if (!ahora) {
    // Dos motivos distintos, y a Diego le sirve saber cuál: "es tarde" se
    // resuelve moviendo la escena a otro día; "la agenda ya lo cubre" significa
    // que la escena SÍ se puede hacer, con los turnos que ya están.
    const cubierta = bandaOcupada(mitad);
    if (candidata) {
      resumen.notas.push(
        `La agenda de hoy ya cubre esa hora (${cubierta.hora_inicio}–${cubierta.hora_fin}): ` +
          `el call center asigna sobre esos turnos.`
      );
    } else {
      resumen.alertas.push(
        "Ya es tarde para abrir turnos de hoy: el call center NO va a poder asignar 'para ahora'. " +
          "Esa escena necesita una asignación de otro día."
      );
    }
  } else {
    const agendaHoy = await crearAgendaModelo(admin, {
      medicoId: params.medicoId,
      nombre: `Demostración — hoy ${hoy} ${ahora.hora_inicio}`,
      fecha_inicio: hoy,
      fecha_fin: hoy,
      duracion_turno: config.slot_duracion_min,
      precio: 0,
      franjas: [{ dia_semana: diaSemana === 0 ? 7 : diaSemana, ...ahora }],
      canal_origen: "acordado",
    });
    if (agendaHoy.ok) {
      resumen.turnosCreados += agendaHoy.turnosCreados;
      // La nota dice QUÉ franja quedó, no una frase genérica: es lo que Diego
      // mira antes de proyectar el otorgador.
      resumen.notas.push(`Turnos de hoy listos: de ${ahora.hora_inicio} a ${ahora.hora_fin}.`);
    } else if (agendaHoy.motivo === "conflicto_agenda") {
      resumen.notas.push(
        `Ya había turnos de hoy entre ${ahora.hora_inicio} y ${ahora.hora_fin}: quedan los que estaban.`
      );
    } else {
      resumen.notas.push(`Turnos de hoy: ${agendaHoy.mensaje}`);
    }
  }

  // La OTRA mitad de "para ahora": la consulta inmediata. Si la ventana de CI de
  // la institución ya cerró, el participante puede prender el toggle todo lo que
  // quiera y el chip no se enciende — y el escenario no lo avisaba.
  if (!dentroVentanaCI(config)) {
    resumen.alertas.push(
      `La ventana de consulta inmediata (${config.ci_ventana_inicio.slice(0, 5)}–` +
        `${config.ci_ventana_fin.slice(0, 5)}) está CERRADA a esta hora: el toggle "disponible" ` +
        `no va a encender ningún chip en el call center. Esa escena no se puede hacer ahora.`
    );
  }

  // 3. El relleno. Pacientes SINTÉTICOS —nombre de utilería, sin DNI inventado—
  //    sentados en algunos horarios del rango, para que la agenda que se
  //    proyecta no sea una grilla vacía.
  //
  // ── IDEMPOTENTE, PORQUE ESTE BOTÓN SE TOCA DOS VECES ──────────────────────
  // La agenda ya lo era (`crearAgendaModelo` frena por choque de horarios y se
  // reporta como nota) y el respaldo también. El relleno NO: cada corrida creaba
  // cuatro cuentas `auth` y cuatro fichas de paciente NUEVAS. Y el botón se toca
  // dos veces siempre — se prepara a la mañana, se ajusta antes de empezar, y
  // alguien lo aprieta de nuevo "por las dudas". A la tercera había doce
  // pacientes de utilería en el padrón de la provincia y una agenda proyectada
  // que ya no se parecía a un piloto.
  //
  // Ahora se cuenta lo que ESTA reunión ya tiene sentado con este profesional y
  // se completa la diferencia, reutilizando primero a los de utilería que ya
  // existen y quedaron libres.
  const cuantos = Math.max(0, Math.min(params.relleno ?? 4, 10));
  if (cuantos > 0) {
    const { data: dePapel } = await admin
      .from("pacientes")
      .select("id, provisionado_detalle")
      .eq("demo_sesion_id", params.sesionId)
      .order("created_at", { ascending: true });
    // El filtro va en JS y no en la query: `provisionado_detalle` es jsonb y un
    // `.contains()` acá dependería de un operador de PostgREST que nadie más de
    // este archivo usa. Son unas pocas filas por reunión.
    const utileria = (dePapel ?? [])
      .filter((p) => (p.provisionado_detalle as { relleno?: boolean } | null)?.relleno === true)
      .map((p) => p.id as string);

    const { data: yaSentados } = utileria.length
      ? await admin
          .from("turnos")
          .select("id, paciente_id")
          .eq("medico_id", params.medicoId)
          .eq("estado", "confirmado")
          .in("paciente_id", utileria)
      : { data: [] as { id: string; paciente_id: string }[] };
    const sentados = (yaSentados ?? []).length;
    const ocupados = new Set((yaSentados ?? []).map((t) => t.paciente_id as string));
    const faltan = cuantos - sentados;

    if (faltan <= 0) {
      resumen.notas.push(
        `Los ${sentados} horarios de utilería ya estaban puestos: no se creó ningún paciente nuevo.`
      );
    } else {
      const { data: libresParaSentar } = await admin
        .from("turnos")
        .select("id, fecha, hora_inicio")
        .eq("medico_id", params.medicoId)
        .eq("estado", "disponible")
        .gt("fecha", hoy) // los de hoy se dejan libres: son los del call center
        .order("fecha", { ascending: true })
        .order("hora_inicio", { ascending: true })
        .limit(faltan * 3);

      // Uno cada tres, para que se vean huecos entre los ocupados (una agenda
      // llena de punta a punta tampoco es lo que muestra un piloto).
      const elegidos = (libresParaSentar ?? []).filter((_, i) => i % 3 === 0).slice(0, faltan);
      // Los de utilería que ya existen y no están sentados con este profesional:
      // se reciclan antes de crear una cuenta más.
      const reciclables = utileria.filter((id) => !ocupados.has(id));

      for (let i = 0; i < elegidos.length; i++) {
        let paciente = reciclables.shift() ?? null;
        if (!paciente) {
          // El índice sigue después de los que ya existen para que dos corridas
          // no dejen dos "Paciente de demostración 1" en la misma grilla.
          paciente = await crearPacienteRelleno(
            params.sesionId,
            config.dominio,
            utileria.length + i + 1
          );
          if (!paciente) {
            resumen.notas.push("No se pudo crear alguno de los pacientes de relleno.");
            continue;
          }
          resumen.pacientesRelleno++;
        }
        const { error } = await admin
          .from("turnos")
          .update({
            paciente_id: paciente,
            estado: "confirmado",
            asignada_at: new Date().toISOString(),
          })
          .eq("id", elegidos[i].id)
          .eq("estado", "disponible"); // no pisar algo que se acaba de asignar de verdad
        if (error) {
          resumen.notas.push(`No se pudo sentar a un paciente de relleno: ${error.message}`);
        } else {
          resumen.turnosOcupados++;
        }
      }
    }
  }

  // 4. El profesional de RESPALDO: el destino de la reprogramación.
  await asegurarRespaldo({
    sesionId: params.sesionId,
    especialidad: ficha.especialidad as string,
    desde,
    hasta,
    duracion: config.slot_duracion_min,
    mitad,
    finDeSemana,
    resumen,
  });

  // ── "OK" ES QUE LA AGENDA EXISTA, NO QUE SE HAYA CREADO AHORA ─────────────
  // Era `turnosCreados > 0 || turnosOcupados > 0`, o sea que la SEGUNDA corrida
  // —la que no crea nada porque ya estaba todo puesto, que es exactamente lo que
  // se busca— se reportaba como "No se pudo dejar la agenda lista", en rojo,
  // sobre un escenario impecable. Lo que hay que responder es si el profesional
  // tiene turnos en el rango.
  const { count, error: errCuenta } = await admin
    .from("turnos")
    .select("id", { count: "exact", head: true })
    .eq("medico_id", params.medicoId)
    .gte("fecha", desde)
    .lte("fecha", hasta);
  if (errCuenta) {
    // No se pudo comprobar: se cae al criterio viejo antes que mentir.
    resumen.ok = resumen.turnosCreados > 0 || resumen.turnosOcupados > 0;
  } else {
    resumen.ok = (count ?? 0) > 0;
  }
  if (!resumen.ok && resumen.notas.length === 0 && resumen.alertas.length === 0) {
    resumen.alertas.push("No quedó ningún turno en el rango: revisá las fechas.");
  }
  return resumen;
}

/** Paciente de utilería. Marcado con la sesión: se va con "limpiar reunión". */
async function crearPacienteRelleno(
  sesionId: string,
  dominio: string,
  indice: number
): Promise<string | null> {
  const admin = createAdminClient();
  const email = emailDemo(randomBytes(4).toString("hex"), dominio);
  const { data: user, error: errUser } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { origen: "demo", rol: "relleno" },
  });
  if (errUser || !user?.user) {
    console.error("[demo/escenario] createUser del relleno falló:", errUser?.message);
    return null;
  }
  const { data, error } = await admin
    .from("pacientes")
    .insert({
      user_id: user.user.id,
      nombre_completo: nombreRelleno(indice),
      email, // alias no entregable, igual que el del participante
      demo_sesion_id: sesionId,
      es_cuenta_test: true,
      provisionado_via: "panel",
      provisionado_detalle: { demo_sesion_id: sesionId, relleno: true },
      provisionado_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("[demo/escenario] insert del relleno falló:", error?.message);
    await admin.auth.admin.deleteUser(user.user.id).catch(() => {});
    return null;
  }
  return data.id;
}

/**
 * Se asegura de que la reunión tenga a DÓNDE reprogramar.
 *
 * ── POR QUÉ ──────────────────────────────────────────────────────────────────
 * La Escena 7 es Nova reprogramando un día entero. `reprogramarMasivo` busca
 * candidatos en la oferta y DESCARTA al propio profesional (`p.medico_id ===
 * medicoId → return`). Si Diego invitó a uno solo —el caso normal, y el que
 * pide el guion— no hay ningún candidato: "no hay a quién reasignar", en vivo,
 * en la escena que se presenta como el salto tecnológico.
 *
 * El respaldo es un profesional de la MISMA reunión (así vive en el mismo mundo
 * de la oferta y no toca al padrón real), con agenda espejo y sin celular: no es
 * un participante, no recibe enlace, y se va con "limpiar reunión" como todo lo
 * demás. Se crea UNO solo: si la reunión ya tiene dos profesionales, no hace
 * falta.
 */
async function asegurarRespaldo(params: {
  sesionId: string;
  especialidad: string;
  desde: string;
  hasta: string;
  duracion: number;
  mitad: MitadDelDia;
  finDeSemana: boolean;
  resumen: ResumenEscenario;
}): Promise<void> {
  const { sesionId, especialidad, desde, hasta, duracion, resumen } = params;
  const admin = createAdminClient();
  const { data: deLaReunion, error } = await admin
    .from("medicos")
    .select("id")
    .eq("demo_sesion_id", sesionId)
    .eq("especialidad", especialidad);
  if (error) {
    resumen.notas.push("No se pudo comprobar si hay un profesional de respaldo para reprogramar.");
    return;
  }
  if ((deLaReunion ?? []).length >= 2) return;

  const creado = await provisionarProfesionalDemo({
    sesionId,
    datos: {
      nombre: NOMBRE_RESPALDO,
      celular: null,
      rol: "profesional",
      dni: null,
      fecha_nacimiento: null,
      especialidad,
    },
    titulo: null,
  });
  if (!creado.ok) {
    resumen.notas.push(
      "No se pudo crear el profesional de respaldo: la escena de reprogramar no va a tener a quién reasignar."
    );
    return;
  }

  const agenda = await crearAgendaModelo(admin, {
    medicoId: creado.profesional.medicoId,
    nombre: `Demostración — respaldo ${desde} a ${hasta}`,
    fecha_inicio: desde,
    fecha_fin: hasta,
    duracion_turno: duracion,
    precio: 0,
    // Misma banda que el participante (la reprogramación prefiere el MISMO DÍA,
    // así que los horarios tienen que solaparse) pero por el motor OFRECIDO.
    //
    // ── POR QUÉ OFRECIDO Y NO ACORDADO ────────────────────────────────────────
    // `priorizarOferta` ordena por categoría antes que por reparto parejo: CI
    // activa > acordado > ofrecido. Con acordado y cero asignaciones, el respaldo
    // empataba con el participante y el desempate quedaba en el orden alfabético
    // — o sea que el andamio de la escena podía salir PRIMERO en la pantalla del
    // call center, justo cuando Diego muestra cómo se elige al participante.
    // Ofrecido lo deja siempre debajo, sin sacarlo de la oferta: la
    // reprogramación lo sigue encontrando, que es para lo único que existe.
    franjas: franjasEscenario(params.mitad, params.finDeSemana),
    canal_origen: "ofrecido",
  });
  if (agenda.ok) {
    resumen.turnosCreados += agenda.turnosCreados;
    resumen.respaldoCreado = true;
  } else {
    resumen.notas.push("El profesional de respaldo quedó sin agenda: revisá antes de la escena de reprogramar.");
  }
}
