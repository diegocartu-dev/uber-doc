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
import { emailDemo } from "@/lib/institucional/demo";
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
 * El rango del escenario: del 20 al 30 de agosto, que es lo que pide el guion.
 *
 * Con dos cuidados que no son adorno:
 *   · nunca arranca en el pasado — un slot de ayer no lo puede asignar nadie y
 *     solo ensucia la agenda que se va a proyectar;
 *   · si esas fechas ya pasaron enteras (la reunión se corrió a septiembre),
 *     cae a los próximos diez días. Es preferible una demo con turnos que una
 *     demo fiel a una fecha que quedó vieja.
 */
export function rangoEscenarioPorDefecto(ahora: Date = new Date()): { desde: string; hasta: string } {
  const hoy = hoyAR(ahora);
  const anio = Number(hoy.slice(0, 4));
  const inicioAgosto = `${anio}-08-20`;
  const finAgosto = `${anio}-08-30`;

  if (hoy > finAgosto) {
    const d = new Date(hoy + "T12:00:00");
    const fin = new Date(d);
    fin.setDate(fin.getDate() + 10);
    return { desde: hoy, hasta: iso(fin) };
  }
  return { desde: hoy > inicioAgosto ? hoy : inicioAgosto, hasta: finAgosto };
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

/** Nombres del relleno: obviamente sintéticos, para que nadie los lea como reales. */
export function nombreRelleno(i: number): string {
  return `Paciente de demostración ${i}`;
}

// ─── Preparación real ────────────────────────────────────────────────────────

export interface ResumenEscenario {
  ok: boolean;
  turnosCreados: number;
  turnosOcupados: number;
  pacientesRelleno: number;
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
    .select("id, demo_sesion_id")
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
  const ahora = franjaDeAhora(new Date(), config.ci_ventana_fin.slice(0, 5));
  const hoy = hoyAR();
  if (!ahora) {
    resumen.notas.push(
      "Ya es tarde para abrir turnos de hoy: la escena del call center va a necesitar una asignación de otro día."
    );
  } else {
    const diaSemana = new Date(hoy + "T12:00:00").getDay();
    const agendaHoy = await crearAgendaModelo(admin, {
      medicoId: params.medicoId,
      nombre: `Demostración — hoy ${hoy}`,
      fecha_inicio: hoy,
      fecha_fin: hoy,
      duracion_turno: config.slot_duracion_min,
      precio: 0,
      franjas: [{ dia_semana: diaSemana === 0 ? 7 : diaSemana, ...ahora }],
      canal_origen: "acordado",
    });
    if (agendaHoy.ok) {
      resumen.turnosCreados += agendaHoy.turnosCreados;
    } else if (agendaHoy.motivo === "conflicto_agenda") {
      resumen.notas.push("Ya había turnos de hoy a esta hora: quedan los que estaban.");
    } else {
      resumen.notas.push(`Turnos de hoy: ${agendaHoy.mensaje}`);
    }
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
