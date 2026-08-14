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
// turnos ACORDADOS del 20 al 30 de agosto (los levanta la institución, R4),
// con franjas de mañana y de tarde y la duración que manda el config (R10), y
// unos pocos pacientes ya sentados en algunos horarios para que la agenda se
// vea viva.
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

/** Mañana y tarde, de lunes a viernes — la agenda típica de un efector. */
export const FRANJA_MANANA = { hora_inicio: "09:00", hora_fin: "12:00" };
export const FRANJA_TARDE = { hora_inicio: "15:00", hora_fin: "18:00" };

export function franjasEscenario(): Franja[] {
  const franjas: Franja[] = [];
  for (let dia = 1; dia <= 5; dia++) {
    franjas.push({ dia_semana: dia, ...FRANJA_MANANA });
    franjas.push({ dia_semana: dia, ...FRANJA_TARDE });
  }
  return franjas;
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
 */
export const NOMBRE_RESPALDO = "Profesional de demostración (respaldo)";

// ─── Preparación real ────────────────────────────────────────────────────────

export interface ResumenEscenario {
  ok: boolean;
  turnosCreados: number;
  turnosOcupados: number;
  pacientesRelleno: number;
  /** Se creó el profesional de respaldo (el destino de la reprogramación). */
  respaldoCreado: boolean;
  /** Lo que no se pudo hacer, dicho en criollo. Vacío = quedó todo listo. */
  notas: string[];
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

  // 1. La agenda del guion: turnos ACORDADOS (los levanta la institución).
  const agenda = await crearAgendaModelo(admin, {
    medicoId: params.medicoId,
    nombre: `Demostración ${desde} a ${hasta}`,
    fecha_inicio: desde,
    fecha_fin: hasta,
    duracion_turno: config.slot_duracion_min,
    precio: 0, // el paciente no paga nunca (R2)
    franjas: franjasEscenario(),
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

  // 2. La franja de HOY, para que el call center pueda asignar "para ahora".
  const hoy = hoyAR();
  const diaSemana = new Date(hoy + "T12:00:00").getDay();
  // Lo que la agenda principal YA cubre hoy: hay que descontarlo o el pedido se
  // pisa con ella y no se crea nada (ver `huecoDeHoy`).
  const yaCubiertoHoy =
    hoy >= desde && hoy <= hasta && diaSemana >= 1 && diaSemana <= 5
      ? [FRANJA_MANANA, FRANJA_TARDE]
      : [];
  const candidata = franjaDeAhora(new Date(), config.ci_ventana_fin.slice(0, 5));
  const ahora = huecoDeHoy(candidata, yaCubiertoHoy, config.slot_duracion_min);

  if (!ahora) {
    // Dos motivos distintos, y a Diego le sirve saber cuál: "es tarde" se
    // resuelve moviendo la escena a otro día; "la agenda ya lo cubre" significa
    // que la escena SÍ se puede hacer, con los turnos que ya están.
    resumen.notas.push(
      candidata
        ? `La agenda de hoy ya cubre esa hora (${FRANJA_MANANA.hora_inicio}–${FRANJA_MANANA.hora_fin} y ` +
            `${FRANJA_TARDE.hora_inicio}–${FRANJA_TARDE.hora_fin}): el call center asigna sobre esos turnos.`
        : "Ya es tarde para abrir turnos de hoy: la escena del call center va a necesitar una asignación de otro día."
    );
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
    resumen.notas.push(
      `La ventana de consulta inmediata (${config.ci_ventana_inicio.slice(0, 5)}–` +
        `${config.ci_ventana_fin.slice(0, 5)}) está cerrada a esta hora: el toggle "disponible" ` +
        `no va a encender ningún chip en el call center.`
    );
  }

  // 3. El relleno. Pacientes SINTÉTICOS —nombre de utilería, sin DNI inventado—
  //    sentados en algunos horarios del rango, para que la agenda que se
  //    proyecta no sea una grilla vacía.
  const cuantos = Math.max(0, Math.min(params.relleno ?? 4, 10));
  if (cuantos > 0) {
    const { data: libres } = await admin
      .from("turnos")
      .select("id, fecha, hora_inicio")
      .eq("medico_id", params.medicoId)
      .eq("estado", "disponible")
      .gt("fecha", hoy) // los de hoy se dejan libres: son los del call center
      .order("fecha", { ascending: true })
      .order("hora_inicio", { ascending: true })
      .limit(cuantos * 3);

    // Uno cada tres, para que se vean huecos entre los ocupados (una agenda
    // llena de punta a punta tampoco es lo que muestra un piloto).
    const elegidos = (libres ?? []).filter((_, i) => i % 3 === 0).slice(0, cuantos);

    for (let i = 0; i < elegidos.length; i++) {
      const paciente = await crearPacienteRelleno(params.sesionId, config.dominio, i + 1);
      if (!paciente) {
        resumen.notas.push("No se pudo crear alguno de los pacientes de relleno.");
        continue;
      }
      resumen.pacientesRelleno++;
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

  // 4. El profesional de RESPALDO: el destino de la reprogramación.
  await asegurarRespaldo(params.sesionId, ficha.especialidad as string, desde, hasta, config.slot_duracion_min, resumen);

  resumen.ok = resumen.turnosCreados > 0 || resumen.turnosOcupados > 0;
  if (!resumen.ok && resumen.notas.length === 0) {
    resumen.notas.push("No quedó ningún turno nuevo: revisá el rango de fechas.");
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
async function asegurarRespaldo(
  sesionId: string,
  especialidad: string,
  desde: string,
  hasta: string,
  duracion: number,
  resumen: ResumenEscenario
): Promise<void> {
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
    franjas: franjasEscenario(),
    canal_origen: "acordado",
  });
  if (agenda.ok) {
    resumen.turnosCreados += agenda.turnosCreados;
    resumen.respaldoCreado = true;
  } else {
    resumen.notas.push("El profesional de respaldo quedó sin agenda: revisá antes de la escena de reprogramar.");
  }
}
